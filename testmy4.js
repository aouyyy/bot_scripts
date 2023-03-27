const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');

const GOODS_LIST = [
  { id: 1013, name: '天使精灵运' },
  { id: 1014, name: '天使精灵乐' },
  { id: 1015, name: '天使精灵富' },
  { id: 1016, name: '天使精灵学' },
  { id: 1031, name: '张青' },
];
const TOKEN_PATH = './token.txt';
const ORDER_NUM_PER_WORKER = 2;

const STATUS_SUCCESS = 1;
const STATUS_ORDER_EXISTS = 0;
const MSG_ORDER_EXISTS = '当前账号存在其他尚未支付的订单';
const STATUS_PAY_NOT_ENABLED = 0;
const MSG_PAY_NOT_ENABLED_HF = '未开通汇付支付';
const MSG_PAY_NOT_ENABLED_YB = '未开通易宝支付';
const STATUS_GOODS_LOCKED = 0;
const MSG_GOODS_LOCKED = '该藏品已被锁定';
const STATUS_TOO_BUSY = 0;
const MSG_TOO_BUSY = '太火爆了,请稍后再试';
const PUSH_API = 'http://echowxsy.cn:28888/message';

// 加载账号列表
const tokens = fs.readFileSync(TOKEN_PATH, 'utf8')
  .split('\n')
  .map(token => token.trim())
  .filter(token => token);

// 创建子进程
if (cluster.isMaster) {
  for (let i = 0; i < Math.min(numCPUs, tokens.length); i++) {
    const worker = cluster.fork();
    worker.send({ tokens: tokens.slice(i * ORDER_NUM_PER_WORKER, (i + 1) * ORDER_NUM_PER_WORKER) });
  }
} else {
  process.on('message', async ({ tokens }) => {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      console.log(`子进程 ${process.pid} 处理账号 ${token}`);

      // 获取账户信息
      const userInfoHeaders = {
        'Content-Type': 'application/json',
        'Origin': 'http://mayi.art',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1',
        'Referer': 'http://mayi.art/',
        'token': token,
        'Content-Length': '2',
      };

      try {
        const { data: userInfoData } = await axios.post('https://app-api.mayi.art/api/user/getUserInfo', {}, { headers: userInfoHeaders });

        const { yibao_status, huifu_account } = userInfoData.data;

        for (let j = 0; j < GOODS_LIST.length; j++) {
          const id = GOODS_LIST[j].id;
          const headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'http://mayi.art/',
            'Origin': 'http://mayi.art',
            'Accept': '/',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/20) uni-app',
            'token': token,
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
          };

          try {
            const { data } = await axios.post('https://app-api.mayi.art/api/market/market/getMarketGoodsListByGoodsId', {
              page: 1,
              sort: 'price',
              type: 2,
              id,
              order: 'asc',
            }, { headers });

            const list = data.data.list.filter(item => item.status !== 4);

            if (list.length === 0) {
              console.log(`账号 ${token}，商品编号 ${id} 没有该商品或该商品已全部售完`);
              continue;
            }

            const allGoodsLocked = list.every(item => item.status === 2);
            if (allGoodsLocked) {
              console.log(`账号 ${token}，商品编号 ${id} 所有商品已被锁定`);
              continue;
            }

            const orders = list.map(item => ({
              market_goods_id: item.id,
              pay_type: 4,
              pay_way: '',
            }));

            const orderHeaders = {
              'Content-Type': 'application/json',
              'Accept-Encoding': 'gzip, deflate, br',
              'Referer': 'http://mayi.art/',
              'Origin': 'http://mayi.art',
              'Accept': '*/*',
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1',
              'token': token,
              'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            };

            for (let k = 0; k < orders.length; k++) {
              const { market_goods_id, pay_way } = orders[k];

              // 选择支付方式
              if (yibao_status === 1 && huifu_account === 0) {
                orders[k].pay_way = 'yibao';
              } else if (yibao_status === 0 && huifu_account === 1) {
                orders[k].pay_way = 'huifu';
              } else {
                orders[k].pay_way = list.find(item => item.id === market_goods_id).income_type.includes('yibao') ? 'yibao' : 'huifu';
              }

              try {
                const { data: orderData } = await axios.post('https://app-api.mayi.art/api/order/pay/CreateMarketOrder', JSON.stringify(orders[k]).replace(/TOKEN/g, token), { headers: orderHeaders });

                const { code, msg, data: { order_sn, order_id } } = orderData;
                if (code === 1 && msg === '下单成功') {
                  console.log(`账号 ${token}，商品编号 ${id} 下单成功`);
                  // 发送微信推送
                  const pushMsg = `商品${GOODS_LIST.find(item => item.id === market_goods_id)?.name ?? ''}${code === STATUS_SUCCESS ? '下单成功，订单号：' + order_sn : '下单失败：' + msg}`;
                  await axios.post(PUSH_API, { msg: pushMsg });
                  break;
                } else {
                  console.log(`账号 ${token}，商品编号 ${id} 下单失败：${msg}`);
                }
              } catch (err) {
                console.log(`账号 ${token}，商品编号 ${id} 下单失败：${err.message}`);
              }
            }
          } catch (err) {
            console.log(`账号 ${token}，商品编号 ${id} 请求商品列表失败：${err.message}`);
          }
        }
      } catch (err) {
        console.log(`获取商品信息失败：${err.message}`);
      }
    }
  });
}
const express = require("express");
const app = express();
const expressip = require("express-ip");
const body_type = require("body-parser");
const fs = require("fs");
const { getFullDate, getNowDate, getYesterday } = require("./utils/moment");
const { xml2js } = require("xml-js");

const xYo_httpApi = require("./utils/xYo_httpApi");
const jcode = require("./utils/口令解析");

var config = loadFromFile("./config.json") || [];
var daili_Price = loadFromFile("./daili_Price.json") || [];
var BOT_Command = loadFromFile("./Command.json") || [];

//对应变量代入
var Price = config.Price;

//管理员名单
var adminlist = config.adminlist;
var qunlist = config.qunlist;
//////////////////////////设置定义变量////////////////////////////
var obj = {};
Object.keys(BOT_Command.order).forEach((key) => {
  obj[key] = loadFromFile(`./js/${key}.json`) || [];
});

let jxqd_vx = loadFromFile(`./js/jxqd_vx.json`) || [];
let jxqd_qq = loadFromFile(`./js/jxqd_qq.json`) || [];

let user_paylist = loadFromFile("./js/user_paylist.json") || [];
let daili_list = loadFromFile("./daili_list.json") || [];
let jd_jcode = new jcode();
let vlw_api = new xYo_httpApi(config.Bot);

////////////////////////////////////////////////////////////////////
const cron = require("node-cron");
const dailipay_task = cron.schedule("55 23 * * *", () => {
  Object.keys(daili_list).forEach(async (daili_wxid) => {
    msg = query_user_allorder(daili_wxid);
    await vlw_api.SendTextMsg(msg, daili_wxid);
  });
});
dailipay_task.start();

const userPaylistBakCron = cron.schedule("*/10 * * * *", () => {
  bakUserPayList();
  bakOrderList();
});
bakUserPayList();
bakOrderList();
userPaylistBakCron.start();

app.use(
  body_type.json({
    limit: "500mb",
  })
);
app.use(
  body_type.text({
    limit: "500mb",
  })
);
app.use(
  body_type.urlencoded({
    limit: "500mb",
    extended: true,
  })
);
app.use(expressip().getIpInfoMiddleware);
app.all("*", function (req, res, next) {
  //设置允许跨域的域名，*代表允许任意域名跨域
  res.header("Access-Control-Allow-Origin", "*");
  //允许的header类型
  res.header("Access-Control-Allow-Headers", "content-type");
  //跨域允许的请求方式
  res.header("Access-Control-Allow-Methods", "POST,GET,");
  if (req.method.toLowerCase() == "options")
    res.send(200); //让options尝试请求快速结束
  else next();
});

//端口监听
app.listen(config.listen_port, function () {
  console.log(`系统运行中 监听端口：${config.listen_port}`);
});

//获取对应订单
app.get("/get", function (req, res) {
  try {
    if (req.query.key == "jxqd_vx" || req.query.key == "jxqd_qq") {
      if (req.query.key == "jxqd_vx") res.json(jxqd_vx);
      else res.json(jxqd_qq);
    } else if (req.query.key != undefined) {
      if (req.query.type != undefined && req.query.num != undefined) {
        let orders = [];
        if (!isNaN(req.query.type)) {
          for (let order of obj[req.query.key])
            if (order.No % req.query.type == req.query.num) orders.push(order);
          res.json(orders);
        }
      } else {
        res.json(obj[req.query.key]);
      }
    }
    res.end();
  } catch (e) {
    console.log(e);
    res.status(400);
    res.json({
      code: 400,
      errmsg: e.message,
    });
    res.end();
  }
});

//获取修改变量，完成订单
app.get("/change", function (req, res) {
  try {
    console.log(
      `${getFullDate()} ->${req.ipInfo.ip}->${JSON.stringify(req.query)}`
    );
    if (req.query.token != undefined && req.query.token == config.Token) {
      if (
        req.query.key != undefined &&
        req.query.no != undefined &&
        req.query.status != undefined
      ) {
        if (req.query.key == "jxqd_vx" || req.query.key == "jxqd_qq") {
          if (req.query.key == "jxqd_vx") {
            jxqd_vx[req.query.no - 1].status = req.query.status;
            if (req.query.status) {
              jxqd_vx[req.query.no - 1].finish_timestamp = getFullDate();
            }
            fs.writeFile(
              "./js/jxqd_vx.json",
              JSON.stringify(jxqd_vx, "", "\t"),
              () => {
                console.log(
                  `${getFullDate()} ->订单号:${req.query.no},${
                    req.query.key
                  }文件写入成功`
                );
              }
            );
            res.json(jxqd_vx[req.query.no - 1]);
          } else {
            jxqd_qq[req.query.no - 1].status = req.query.status;
            if (req.query.status) {
              jxqd_qq[req.query.no - 1].finish_timestamp = getFullDate();
            }
            fs.writeFile(
              "./js/jxqd_qq.json",
              JSON.stringify(jxqd_qq, "", "\t"),
              () => {
                console.log(
                  `${getFullDate()} ->订单号:${req.query.no},${
                    req.query.key
                  }文件写入成功`
                );
              }
            );
            res.json(jxqd_qq[req.query.no - 1]);
          }
        } else {
          obj[req.query.key][req.query.no - 1].status = req.query.status;
          if (req.query.status) {
            obj[req.query.key][req.query.no - 1].finish_timestamp =
              getFullDate();
          }
          reply_order_Complete(req);
          fs.writeFile(
            "./js/" + req.query.key + ".json",
            JSON.stringify(obj[req.query.key], "", "\t"),
            () => {
              console.log(
                `${getFullDate()} ->订单号:${req.query.no},${
                  req.query.key
                }文件写入成功`
              );
            }
          );
          res.json(obj[req.query.key][req.query.no - 1]);
        }
      }
    }
    res.end();
  } catch (e) {
    // console.log(e)
    res.status(400);
    res.json({
      code: 400,
      errmsg: JSON.stringify(e),
    });
    res.end();
  }
});

//修改余额
app.get("/change_money", function (req, res) {
  console.log(
    `${getFullDate()} ->${req.ipInfo.ip}->${JSON.stringify(req.query)}`
  );
  if (req.query.token != undefined && req.query.token == config.Token) {
    if (req.query.wxid != undefined && req.query.money != undefined) {
      let WX_Data = { content: { from_wxid: req.query.wxid } };
      msg = `当前剩余${change_user_money(WX_Data, "change", req.query.money)}`;
      res.json(msg);
    }
  }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//主程序
app.post("/", async function (req, res) {
  let WX_Data = req.body;
  // 测试
  fs.appendFileSync("msg.log", `${JSON.stringify(WX_Data)}\n`);
  switch (
    WX_Data.content.type //判断消息类型 // 1/文本消息 3/图片消息 34/语音消息  42/名片消息  43/视频 47/动态表情 48/地理位置  49/分享链接 2004/文件
  ) {
    case 1: {
      WX_Data.content.temp_msg = WX_Data.content.msg;

      if (!WX_Data.content.msg_source) {
        if (WX_Data.content.msg.indexOf("emoji") > -1)
          WX_Data.content.msg = decodeString(WX_Data.content.msg);
      }

      if (
        //群聊和私聊
        WX_Data.Event == "EventGroupChat" ||
        WX_Data.Event == "EventPrivateChat"
      ) {
        const enRegexStr = "[$%￥@！(#!][a-zA-Z0-9]{6,20}[$%￥@！)#!]";
        const cnRegexStr =
          "[㬌京亰倞兢婛景椋猄竞竟競竸綡鲸鶁][\u4e00-\u9fa5]{14,16}[东倲冻凍埬岽崠崬東栋棟涷菄諌鯟鶇]|(?:(?:[2-9]{2}[斤包袋箱]){1}[\u4e00-\u9fa5]{2}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}){3}|(?:[\u4e00-\u9fa5]{4}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}){3}|(?:[\u4e00-\u9fa5]{4}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}){3}|[\u4e00-\u9fa5]{16}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}|[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}[\u4e00-\u9fa5]{14}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}|(?:[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}[\u4e00-\u9fa5]{6}){2}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}|(?:[0-9A-Za-zα-ωА-Яа-яÀ-ž]{3}[\u4e00-\u9fa5]{2}){2}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}|(?:[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}[0-9A-Za-zα-ωА-Яа-яÀ-ž]{2}[\u4e00-\u9fa5]{2}){2}[☂-➾\uD83D\uDC00-\uD83D\uDEFA]{1}";
        let urlRegexStr =
          "(https?)://[-A-Za-z0-9+&@#/%?=~_|!:,.;*]+[-A-Za-z0-9+&@#/%=~_|*]";
        const enRegex = new RegExp(enRegexStr, "u");
        const cnRegex = new RegExp(cnRegexStr, "u");
        const urlRegex = new RegExp(urlRegexStr, "u");
        if (
          enRegex.test(WX_Data.content.msg) ||
          cnRegex.test(WX_Data.content.msg)
        ) {
          //口令识别成功
          let msg = `请检查你的口令是否正确，如果多次尝试失败请更换口令。\r\n${WX_Data.content.msg}`;
          jCommand = await jd_jcode.get_jcode(WX_Data.content.msg);
          if (jCommand && jCommand.data) getjdcode(jCommand, WX_Data);
          else reply_send(msg, WX_Data);
        } else if (urlRegex.test(WX_Data.content.msg)) {
          //文本链接成功
          geturl(WX_Data);
        } else {
          //各种查询 开启 关闭
          let msg = "";
          if (
            WX_Data.content.msg.indexOf("回执") == -1 &&
            WX_Data.content.msg.indexOf("查询") > -1
          ) {
            let work_Group = false;
            if (WX_Data.Event == "EventGroupChat") {
              for (let key of Object.entries(config.qunlist)) {
                if (key[1].indexOf(WX_Data.content.from_group) > -1) {
                  work_Group = true;
                  break;
                }
              }
              if (!work_Group) {
                console.log(
                  `${getFullDate()} -> 微信群:${
                    WX_Data.content.from_group_name
                  },wxid:${WX_Data.content.from_group} ->非接单群 不提供查询`
                );
                break; //非接单群 不提供查询
              }
            }
            let regExp_result = get_regExp_result(WX_Data, "查询");
            if (WX_Data.content.msg_source?.atuserlist?.[0]) {
              //有艾特人就改成回复艾特
              WX_Data.content.from_wxid =
                WX_Data.content.msg_source.atuserlist[0].wxid;
            }
            if (get_Command(regExp_result)) {
              if (
                WX_Data.Event == "EventPrivateChat" &&
                adminlist.indexOf(WX_Data.content.from_wxid) > -1
              ) {
                //鉴权管理员私聊
                let msg = query_admin_order(
                  regExp_result,
                  obj[get_Command(regExp_result)],
                  WX_Data.content.from_wxid
                );
                vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
              } else {
                let msg = query_user_order(
                  regExp_result,
                  obj[get_Command(regExp_result)],
                  WX_Data.content.from_wxid
                );
                reply_send(msg, WX_Data, "_query");
              }
            } else {
              switch (regExp_result) {
                case "余额": {
                  msg = `当前剩余：${query_money(
                    WX_Data.content.from_wxid
                  )}[爆竹]\r\n时间${getFullDate()}`;
                  reply_send(msg, WX_Data);
                  break;
                }
                case "代理账单": {
                  if (WX_Data.Event == "EventGroupChat") break;
                  msg = query_user_allorder(WX_Data.content.from_wxid);
                  reply_send(msg, WX_Data);
                  break;
                }
                case "收益":
                case "价格":
                case "代理价格":
                case "群聊列表": {
                  if (
                    WX_Data.Event == "EventPrivateChat" &&
                    adminlist.indexOf(WX_Data.content.from_wxid) > -1
                  ) {
                    //鉴权管理员私聊
                    switch (regExp_result) {
                      case "收益":
                        msg = query_income();
                        vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                        break;
                      case "价格":
                        msg = query_price();
                        vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                        break;
                      case "代理价格":
                        msg = query_price("代理");
                        vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                        break;
                      case "群聊列表":
                        vlw_api.GetGrouplist(WX_Data.content.from_wxid);
                        break;
                    }
                  }
                  break;
                }
                default: {
                  if (regExp_result.includes("代理账单")) {
                    let dateRegexStr = /(\d{4}-\d{2}-\d{2})/;
                    const dateRegex = new RegExp(dateRegexStr, "u");
                    if (dateRegex.test(regExp_result)) {
                      msg = query_daili_order_alltime(
                        WX_Data.content.from_wxid,
                        regExp_result.replace("代理账单", "")
                      );
                      vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                    }
                  } else {
                    console.log(
                      `${getFullDate()} -> 用户:${
                        WX_Data.content.from_name
                      } -> 未定义的订单类型${regExp_result}`
                    );
                  }
                  break;
                }
              }
            }
            break;
          } else if (
            WX_Data.content.msg.includes("开启") ||
            WX_Data.content.msg.includes("关闭")
          ) {
            if (
              WX_Data.Event == "EventGroupChat" &&
              adminlist.indexOf(WX_Data.content.from_wxid) > -1
            ) {
              //群聊管理员控制开启关闭 群聊用于添加接单群
              let regExp_result =
                get_regExp_result(WX_Data, "开启") ||
                get_regExp_result(WX_Data, "关闭");
              if (get_Command(regExp_result)) {
                let task_type = WX_Data.content.msg.includes("开启")
                  ? "add"
                  : "subtract";
                change_group(get_Command(regExp_result), task_type, WX_Data);
              } else {
                console.log(
                  `${getFullDate()} -> 微信群:${
                    WX_Data.content.from_group_name
                  },wxid:${
                    WX_Data.content.from_group
                  } ->未定义的开关类型->${regExp_result}`
                );
              }
            } else if (
              WX_Data.Event == "EventPrivateChat" &&
              adminlist.indexOf(WX_Data.content.from_wxid) > -1
            ) {
              //私聊开启关闭 接单开关
              if (WX_Data.content.msg.includes("接单")) {
                let regExp_result =
                  get_regExp_result(WX_Data, "", "开启(.*)接单") ||
                  get_regExp_result(WX_Data, "", "关闭(.*)接单");
                let state = WX_Data.content.msg.includes("开启");
                if (get_Command(regExp_result)) {
                  config.Enable[get_Command(regExp_result)] = state;
                  change_config2();
                  msg = `${regExp_result}${state ? "开启" : "关闭"}接单`;
                  vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                } else {
                  console.log(
                    `${getFullDate()} -> 未定义的订单接单开关类型->${regExp_result}`
                  );
                }
              } else if (WX_Data.content.msg.includes("回执")) {
                let state = WX_Data.content.msg.includes("开启");
                if (WX_Data.content.msg.includes("完成")) {
                  if (WX_Data.content.msg.includes("一键")) {
                    Object.keys(BOT_Command.order).forEach((order_type) => {
                      config.reply[order_type] = state;
                      config.reply_Group[order_type] = state;
                    });
                    change_config2();
                    msg = `所有完成回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  } else if (WX_Data.content.msg.includes("群聊")) {
                    let regExp_result =
                      get_regExp_result(WX_Data, "", "开启(.*)群聊完成回执") ||
                      get_regExp_result(WX_Data, "", "关闭(.*)群聊完成回执");
                    if (get_Command(regExp_result)) {
                      config.reply_Group[order_type] = state;
                      change_config2();
                      msg = `${regExp_result}完成回执已经${
                        state ? "开启" : "关闭"
                      }`;
                      vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                    }
                  } else if (WX_Data.content.msg.includes("私聊")) {
                    let regExp_result =
                      get_regExp_result(WX_Data, "", "开启(.*)私聊完成回执") ||
                      get_regExp_result(WX_Data, "", "关闭(.*)私聊完成回执");
                    if (get_Command(regExp_result)) {
                      config.reply[order_type] = state;
                      change_config2();
                      msg = `${regExp_result}完成回执已经${
                        state ? "开启" : "关闭"
                      }`;
                      vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                    }
                  } else {
                    console.log(
                      `${getFullDate()} -> 未定义的订单回执开关类型->${regExp_result}`
                    );
                  }
                } else if (WX_Data.content.msg.includes("查询")) {
                  if (WX_Data.content.msg.includes("一键")) {
                    config.reply.Private_query = state;
                    config.reply.Group_query = state;
                    change_config2();
                    msg = `所有查询回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  } else if (WX_Data.content.msg.includes("私聊")) {
                    config.reply.Private_query = state;
                    change_config2();
                    msg = `私聊查询回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  } else if (WX_Data.content.msg.includes("群聊")) {
                    config.reply.Group_query = state;
                    change_config2();
                    msg = `群聊查询回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  }
                } else if (WX_Data.content.msg.includes("提交")) {
                  if (WX_Data.content.msg.includes("一键")) {
                    config.reply.Private_order = state;
                    config.reply.Group_order = state;
                    change_config2();
                    msg = `所有提交回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  } else if (WX_Data.content.msg.includes("私聊")) {
                    config.reply.Private_order = state;
                    change_config2();
                    msg = `私聊提交回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  } else if (WX_Data.content.msg.includes("群聊")) {
                    config.reply.Group_order = state;
                    change_config2();
                    msg = `群聊提交回执已经${state ? "开启" : "关闭"}`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                  }
                } else {
                  console.log(
                    `${getFullDate()} -> 未定义的回执开关类型->${regExp_result}`
                  );
                }
              }
            }
          } else if (
            WX_Data.content.msg.includes("添加") ||
            WX_Data.content.msg.includes("删除")
          ) {
            if (
              WX_Data.Event == "EventGroupChat" &&
              adminlist.indexOf(WX_Data.content.from_wxid) > -1
            ) {
              if (WX_Data.content.msg.includes("回执")) {
                let regExp_result =
                  get_regExp_result(WX_Data, "", "添加(.*)完成回执") ||
                  get_regExp_result(WX_Data, "", "删除(.*)完成回执");
                let task_type = WX_Data.content.msg.includes("添加")
                  ? "add"
                  : "subtract";
                change_reply_group(
                  get_Command(regExp_result),
                  task_type,
                  WX_Data
                );
              }
            }
          } else if (WX_Data.content.msg.indexOf("领现金报名") > -1) {
            regExp_result = get_regExp_result(WX_Data, "领现金报名");
            if (!isNaN(regExp_result)) {
              console.log(
                `${getFullDate()} ->${
                  WX_Data.content.from_name
                }:报名了${regExp_result}个`
              );
              let need_money = (Price.lxj * regExp_result * 1).toFixed(2);
              if (need_money > query_money(WX_Data.content.from_wxid)) {
                console.log(
                  `${getFullDate()} ->当前用户:${
                    WX_Data.content.from_name
                  },剩余${query_money(
                    WX_Data.content.from_wxid
                  )}块,报名领现金所需金额${need_money}块,报名失败`
                );

                msg = `\n当前领现金报名失败！！！剩余${query_money(
                  WX_Data.content.from_wxid
                )}[爆竹],所需${need_money}[爆竹]`;
                if (WX_Data.Event == "EventGroupChat")
                  vlw_api.SendGroupMsgAndAt(
                    msg,
                    WX_Data.content.from_wxid,
                    WX_Data.content.from_group
                  );
                else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
              } else {
                change_user_money(WX_Data, "subtract", need_money);
                let lxj_order = `名称:${WX_Data.content.from_name},wxid:${WX_Data.content.from_wxid}->提交了${regExp_result},完成0个`;
                await fs.appendFileSync(`./js/lxj.txt`, lxj_order + "\n");
                msg = `\n当前领现金报名成功！！！扣除所需${need_money}[爆竹],剩余${query_money(
                  WX_Data.content.from_wxid
                )}[爆竹]`;
                if (WX_Data.Event == "EventGroupChat")
                  vlw_api.SendGroupMsgAndAt(
                    msg,
                    WX_Data.content.from_wxid,
                    WX_Data.content.from_group
                  );
                else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
              }
            } else {
              msg = "领现金报名XXX后面填写人头数字啊！！！！";
              if (WX_Data.Event == "EventGroupChat")
                vlw_api.SendGroupMsgAndAt(
                  msg,
                  WX_Data.content.from_wxid,
                  WX_Data.content.from_group
                );
              else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
            }
          } else if (WX_Data.content.msg == "菜单") {
            let work_Group = false;
            if (WX_Data.Event == "EventGroupChat") {
              for (let key of Object.entries(config.qunlist)) {
                if (key[1].indexOf(WX_Data.content.from_group) > -1) {
                  work_Group = true;
                  break;
                }
              }
              if (!work_Group) {
                console.log(
                  `${getFullDate()} -> 微信群:${
                    WX_Data.content.from_group_name
                  },wxid:${WX_Data.content.from_group} ->非接单群 不提供菜单`
                );
                break; //非接单群 不提供查询
              }
            }
            msg = loadFromFileTest("./菜单.txt");
            if (WX_Data.Event == "EventGroupChat")
              vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
            else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
          } else if (WX_Data.content.msg == "进群") {
            if (WX_Data.Event == "EventGroupChat") break;
            else
              vlw_api.InviteInGroupByLink(
                config.Group,
                WX_Data.content.from_wxid
              );
          } else if (WX_Data.content.msg.includes("玩法")) {
            let work_Group = false;
            if (WX_Data.Event == "EventGroupChat") {
              for (let key of Object.entries(config.qunlist)) {
                if (key[1].indexOf(WX_Data.content.from_group) > -1) {
                  work_Group = true;
                  break;
                }
              }
              if (!work_Group) {
                console.log(
                  `${getFullDate()} -> 微信群:${
                    WX_Data.content.from_group_name
                  },wxid:${WX_Data.content.from_group} ->非接单群 不提供菜单`
                );
                break; //非接单群 不提供查询
              }
            }
            let regExp_result = get_regExp_result(WX_Data, "玩法");

            if (get_Command(regExp_result)) {
              File_path = `./help/${regExp_result}.txt`;
              if (fs.existsSync(File_path)) msg = loadFromFileTest(File_path);
              else msg = loadFromFileTest("./help/帮助.txt");
              if (WX_Data.Event == "EventGroupChat")
                vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
              else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
            }
          } else if (
            WX_Data.content.msg.includes("用法") ||
            WX_Data.content.msg.includes("帮助")
          ) {
            let work_Group = false;
            if (WX_Data.Event == "EventGroupChat") {
              for (let key of Object.entries(config.qunlist)) {
                if (key[1].indexOf(WX_Data.content.from_group) > -1) {
                  work_Group = true;
                  break;
                }
              }
              if (!work_Group) {
                console.log(
                  `${getFullDate()} -> 微信群:${
                    WX_Data.content.from_group_name
                  },wxid:${WX_Data.content.from_group} ->非接单群 不提供菜单`
                );
                break; //非接单群 不提供查询
              }
            }
            msg = loadFromFileTest(`./help/帮助.txt`);
            if (WX_Data.Event == "EventGroupChat")
              vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
            else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
          } else if (WX_Data.content.msg.includes("蒙牛")) {
            add_order(
              "mengniu",
              {
                No: obj.mengniu.length + 1,
                ck: WX_Data.content.msg,
              },
              WX_Data
            );
          } else if (WX_Data.content.msg.includes("领红包+")) {
            let ck = WX_Data.content.msg.replace(/领红包\+/g, "");
            add_order(
              "dlhb",
              {
                No: obj.dlhb.length + 1,
                ck: ck,
              },
              WX_Data
            );
          } else if (WX_Data.content.msg == "毛毛测试") {
            // Object.keys(daili_list).forEach((daili_wxid) => {
            //   msg = query_user_allorder(daili_wxid);
            //   console.log(`代理测试`, msg);
            //   // vlw_api.SendTextMsg(msg, daili_wxid);
            // });
          } else if (
            WX_Data.Event == "EventGroupChat" &&
            adminlist.indexOf(WX_Data.content.from_wxid) > -1
          ) {
            //管理群聊 发其他消息
            switch (WX_Data.content.msg) {
              case "群状态":
                msg = query_Group_status(WX_Data);
                vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
                break;
            }
            break;
          } else if (
            WX_Data.Event == "EventPrivateChat" &&
            adminlist.indexOf(WX_Data.content.from_wxid) > -1
          ) {
            //////////////////////////////////////鉴权管理员私聊专用//////////////////////////////////////////////////////////
            if (WX_Data.content.msg.indexOf("清空") > -1) {
              regExp_result = get_regExp_result(WX_Data, "清空");
              if (get_Command(regExp_result)) {
                //清空订单
                order_clean(get_Command(regExp_result));
                if (get_Command(regExp_result) == "jxqd") {
                  jxqd_vx = [];
                  jxqd_qq = [];
                  fs.writeFile(
                    "./js/jxqd_vx.json",
                    JSON.stringify(jxqd_vx, "", "\t"),
                    () => {
                      console.log(
                        `${getFullDate()} ->订单号:${req.query.no},${
                          req.query.key
                        }文件写入成功`
                      );
                    }
                  );
                  fs.writeFile(
                    "./js/jxqd_qq.json",
                    JSON.stringify(jxqd_qq, "", "\t"),
                    () => {
                      console.log(
                        `${getFullDate()} ->订单号:${req.query.no},${
                          req.query.key
                        }文件写入成功`
                      );
                    }
                  );
                }
                obj[get_Command(regExp_result)] = [];
                msg = `清空所有${regExp_result}订单完成`;
                vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
              } else if (regExp_result == "订单") {
                Object.keys(BOT_Command.order).forEach((order_type) => {
                  if (order_type == "dayingjia") return;
                  order_clean(order_type);
                });
                msg = `所有清空订单完成(大赢家除外)`;
                vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
              }
              break;
            } else if (WX_Data.content.msg.indexOf("设置") > -1) {
              if (WX_Data.content.msg.includes("代理")) {
                let regExp = new RegExp(`(.*)设置代理(.*)价格(.*)`, "i");
                let regExp_result = WX_Data.content.msg.match(regExp);
                console.log(
                  `${getFullDate()} ->匹配成功,成功匹配内容:${regExp_result}`
                );
                set_Price = regExp_result?.[3];
                regExp_result = regExp_result?.[1] || regExp_result?.[2];
                if (get_Command(regExp_result)) {
                  daili_Price[get_Command(regExp_result)] = Number(set_Price);
                  fs.writeFile(
                    "./daili_Price.json",
                    JSON.stringify(daili_Price, "", "\t"),
                    () => {
                      //重新刷新变量
                      daili_Price = loadFromFile("./daili_Price.json") || [];
                    }
                  );
                  msg = `代理-项目价格设置成功\r\n【${regExp_result}】价格设置->${set_Price}[爆竹]\r\n时间:${getFullDate()}`;
                  vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                }
              } else {
                let regExp = new RegExp(`(.*)设置(.*)价格(.*)`, "i");
                let regExp_result = WX_Data.content.msg.match(regExp);
                console.log(
                  `${getFullDate()} ->匹配成功,成功匹配内容:${regExp_result}`
                );
                set_Price = regExp_result?.[3];
                regExp_result = regExp_result?.[1] || regExp_result?.[2];
                if (get_Command(regExp_result)) {
                  config.Price[get_Command(regExp_result)] = Number(set_Price);
                  change_config2();
                  msg = `项目价格设置成功\r\n【${regExp_result}】价格设置->${set_Price}[爆竹]\r\n时间:${getFullDate()}`;
                  vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
                }
              }

              break;
            } else if (WX_Data.content.msg.indexOf("退单") > -1) {
              regExp_result = get_regExp_result(WX_Data, "退单");
              if (get_Command(regExp_result)) {
                chargeback_user_order(get_Command(regExp_result), WX_Data);
              }
              break;
            } else if (WX_Data.content.msg == "回执状态") {
              msg = query_reply();
              vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
            } else if (WX_Data.content.msg == "接单状态") {
              msg = query_order_Enable();
              vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
            } else if (
              WX_Data.content.msg.includes("一键发送") &&
              WX_Data.content.msg.includes("代理账单")
            ) {
              console.log(WX_Data.content.msg);
              let dateRegexStr = /(\d{4}-\d{2}-\d{2})/;
              const dateRegex = new RegExp(dateRegexStr, "u");
              if (dateRegex.test(WX_Data.content.msg)) {
                Object.keys(daili_list).forEach(async (daili_wxid) => {
                  msg = query_daili_order_alltime(
                    daili_wxid,
                    WX_Data.content.msg
                      .replace("一键发送", "")
                      .replace("代理账单", "")
                  );
                  await vlw_api.SendTextMsg(msg, daili_wxid);
                  // console.log(msg);
                });
              }
            }
          } else {
            if (WX_Data.Event == "EventGroupChat")
              console.log(
                `${getFullDate()} -> 微信群:${
                  WX_Data.content.from_group_name
                } -> ${WX_Data.content.from_name}:${WX_Data.content.msg}`
              );
            else
              console.log(
                `${getFullDate()} ->${WX_Data.content.from_name}:${
                  WX_Data.content.msg
                }`
              );
          }
        }
      } else if (WX_Data.Event == "EventDeviceCallback") {
        //设备回调 判断是否群聊 用于机器人自己开启一些功能
        if (WX_Data.content.to_wxid.indexOf("chatroom") == -1) {
          let Tmep_WX_Data = {
            content: { from_wxid: WX_Data.content.to_wxid },
          };
          if (WX_Data.content.msg.includes("加余额")) {
            regExp_result = get_regExp_result(WX_Data, "加余额");
            if (!isNaN(regExp_result)) {
              console.log(
                `${getFullDate()} ->添加wxid:${
                  WX_Data.content.to_wxid
                }余额${regExp_result}块`
              );
              msg = `账号名字:${WX_Data.content.to_name}\nwxid:${
                WX_Data.content.to_wxid
              }\n余额：${change_user_money(
                Tmep_WX_Data,
                "add",
                regExp_result
              )}[爆竹]`;
              vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
              break;
            }
          } else {
            switch (WX_Data.content.msg) {
              case "查余额":
                msg = `账号名字:${WX_Data.content.to_name}\nwxid:${
                  WX_Data.content.to_wxid
                }\n余额：${query_money(WX_Data.content.to_wxid)}[爆竹]`;
                vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                break;
              case "清空余额":
                WX_Data.content.from_wxid = WX_Data.content.to_wxid;
                change_user_money(WX_Data, "change", 0);
                msg = `账号名字:${WX_Data.content.to_name}\nwxid:${
                  WX_Data.content.to_wxid
                }\n余额：${query_money(WX_Data.content.to_wxid)}[爆竹]`;
                vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                break;
              case "查询账单":
                msg = query_user_allorder(WX_Data.content.to_wxid);
                vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                break;
              case "添加代理":
                daili_list[WX_Data.content.to_wxid] = WX_Data.content.to_name;
                fs.writeFile(
                  "./daili_list.json",
                  JSON.stringify(daili_list, "", "\t"),
                  () => {
                    msg = `用户名:${WX_Data.content.to_name}\r\nwxid:${WX_Data.content.to_wxid}\r\n代理添加成功\r\n每天23:55发送账单,请注意查收`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                  }
                );
                break;
              case "删除代理":
                delete daili_list[WX_Data.content.to_wxid];
                fs.writeFile(
                  "./daili_list.json",
                  JSON.stringify(daili_list, "", "\t"),
                  () => {
                    msg = `用户名:${WX_Data.content.to_name}\r\nwxid:${WX_Data.content.to_wxid}\r\n代理已被移除\r\n`;
                    vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                  }
                );
                break;
              default:
                if (WX_Data.content.msg.includes("查询")) {
                  if (WX_Data.content.msg.includes("代理账单")) {
                    let dateRegexStr = /(\d{4}-\d{2}-\d{2})/;
                    const dateRegex = new RegExp(dateRegexStr, "u");
                    if (dateRegex.test(WX_Data.content.msg)) {
                      msg = query_daili_order_alltime(
                        WX_Data.content.to_wxid,
                        WX_Data.content.msg
                          .replace("查询", "")
                          .replace("代理账单", "")
                      );
                      vlw_api.SendTextMsg(msg, WX_Data.content.to_wxid);
                    }
                  }
                }

                break;
            }
          }
        } else {
          WX_Data.content.from_wxid = WX_Data.content.robot_wxid;
          WX_Data.content.from_group = WX_Data.content.to_wxid;
          WX_Data.content.from_group_name = WX_Data.content.to_name;
          if (
            WX_Data.content.msg.includes("开启") ||
            WX_Data.content.msg.includes("关闭")
          ) {
            regExp_result =
              get_regExp_result(WX_Data, "开启") ||
              get_regExp_result(WX_Data, "关闭");

            if (get_Command(regExp_result)) {
              if (WX_Data.content.msg.includes("开启")) {
                change_group(get_Command(regExp_result), "add", WX_Data);
              } else {
                change_group(get_Command(regExp_result), "subtract", WX_Data);
              }
            }
            break;
          } else if (
            WX_Data.content.msg.includes("添加") ||
            WX_Data.content.msg.includes("删除")
          ) {
            if (WX_Data.content.msg.includes("回执")) {
              let regExp_result =
                get_regExp_result(WX_Data, "", "添加(.*)完成回执") ||
                get_regExp_result(WX_Data, "", "删除(.*)完成回执");
              let task_type = WX_Data.content.msg.includes("添加")
                ? "add"
                : "subtract";
              change_reply_group(
                get_Command(regExp_result),
                task_type,
                WX_Data
              );
            }
          } else if (WX_Data.content.msg.includes("群状态")) {
            msg = query_Group_status(WX_Data);
            vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
            break;
          }
        }
      } else {
        if (WX_Data.Event == "EventGroupChat")
          console.log(
            `${getFullDate()} -> 微信群:${WX_Data.content.from_group_name} -> ${
              WX_Data.content.from_name
            }:${WX_Data.content.msg}`
          );
        else
          console.log(
            `${getFullDate()} ->${WX_Data.content.from_name}:${
              WX_Data.content.msg
            }`
          );
      }
      break;
    }
    case 49: {
      geturl(WX_Data);
      break;
    }
    case 2002: {
      //小程序
      try {
        msgJson = xml2js(WX_Data.content.msg, { compact: true });
        pagepath = msgJson.msg.appmsg.weappinfo.pagepath;
        // console.log(pagepath);
        if (pagepath) {
          let page_path = pagepath._cdata || pagepath._text || [];
          if (page_path) {
            if (
              page_path.includes("pages/market/market") ||
              page_path.includes("pages/marketing/glb")
            ) {
              let active_id = getQueryString(page_path, "active_id"); //获取类型
              let group_id = getQueryString(page_path, "group_id");
              if (!isItemInArray(obj.hbt, "group_id", group_id)) {
                add_order(
                  "hbt",
                  {
                    No: obj.hbt.length + 1,
                    active_id: active_id,
                    group_id: group_id,
                    pagepath: page_path,
                  },
                  WX_Data,
                  "xml"
                );
              } else {
                console.log(
                  `${getFullDate()} ->红包团group_id:${group_id}已经提交过`
                );
              }
            } else if (page_path.includes("tourl")) {
              while (page_path.includes("%"))
                page_path = decodeURIComponent(page_path);
              let taskId = getQueryString(page_path, "taskId");
              let inviteId = getQueryString(page_path, "inviteId");
              let activityId = getQueryString(page_path, "activityId");
              let appId = getQueryString(page_path, "appId");
              if (!isItemInArray(obj.ddf, "inviteId", inviteId)) {
                add_order(
                  "ddf",
                  {
                    No: obj.ddf.length + 1,
                    taskId: taskId,
                    inviteId: inviteId,
                    activityId: activityId,
                    appId: appId,
                    pagepath: page_path,
                  },
                  WX_Data,
                  "xml"
                );
              } else {
                console.log(
                  `${getFullDate()} ->单单返inviteId:${inviteId}已经提交过`
                );
              }
            } else if (
              page_path.includes("pages/farm/pages/index/index.html")
            ) {
              let shareCode =
                getQueryString(page_path, "shareCode") ||
                getQueryString(page_path, "inviteCode"); //获取类型

              if (shareCode.includes("-")) {
                console.log(`${getFullDate()} ->农场提交失败${shareCode}`);
                break;
              }
              if (!isItemInArray(obj.ncjs, "shareCode", shareCode)) {
                add_order(
                  "ncjs",
                  {
                    No: obj.ncjs.length + 1,
                    shareCode: shareCode,
                    pagepath: page_path,
                  },
                  WX_Data,
                  "xml"
                );
              } else {
                console.log(
                  `${getFullDate()} ->农场shareCode:${shareCode}已经提交过`
                );
              }
            } else if (page_path.includes("/ccs/home")) {
              console.log(JSON.stringify(pagepath));
              //城城分现金
              let inviteId = getQueryString(page_path, "inviteId");
              let encryptedPin = getQueryString(page_path, "encryptedPin");

              // if (!isItemInArray(obj.cc, "encryptedPin", encryptedPin)) {
              add_order(
                "cc",
                {
                  No: obj.cc.length + 1,
                  inviteId: inviteId,
                  pagepath: page_path,
                },
                WX_Data,
                "xml"
              );
              // } else {
              //   console.log(
              //     `${getFullDate()} ->城城分现金inviteId:${inviteId}已经提交过`
              //   );
              // }
            } else if (page_path.includes("pages/promote/qiandao/index.html")) {
              let smp = getQueryString(page_path, "smp");
              //京喜签到
              if (!isItemInArray(obj.jxqd, "smp", smp)) {
                add_order(
                  "jxqd",
                  {
                    No: obj.jxqd.length + 1,
                    smp: smp,
                  },
                  WX_Data,
                  "xml"
                );
              } else {
                console.log(`${getFullDate()} ->京喜签到smp:${smp}已经提交过`);
              }
            } else {
              console.log(page_path);
            }
          }
        }
      } catch (error) {
        console.log(error);
        console.log(WX_Data);
      }
      break;
    }
    case 3:
    case 14:
    case 15:
    case 17: {
      //好友提醒
      if (WX_Data.content.v1 != undefined && WX_Data.content.v2 != undefined) {
        if (
          await vlw_api.AgreeFriendVerify(
            WX_Data.content.from_wxid,
            WX_Data.content.v1,
            WX_Data.content.v2,
            WX_Data.content.type
          )
        ) {
          //添加好友成功发公告
          vlw_api.SendTextMsg(
            `你好，欢迎使用本机器人，用法请发送菜单！`,
            WX_Data.content.from_wxid
          );

          msg = fs.readFileSync("./菜单.txt", "utf-8");
          vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
        }
      }
      break;
    }
    case 2000: {
      //私聊转账
      if (WX_Data.Event == "EventPrivateChat") {
        WX_Data.content.msg = JSON.parse(WX_Data.content.msg);
        console.log(
          `${getFullDate()} ->${WX_Data.content.from_name}:转账了${
            WX_Data.content.msg.money
          }块`
        );
        if (
          await vlw_api.AccepteTransfer(
            WX_Data.content.from_wxid,
            WX_Data.content.msg.payer_pay_id,
            WX_Data.content.msg.receiver_pay_id,
            WX_Data.content.msg.paysubtype,
            WX_Data.content.msg.money
          )
        ) {
          vlw_api.SendTextMsg(
            `嘀嘀嘀,收到了！当前剩余${change_user_money(
              WX_Data,
              "add",
              WX_Data.content.msg.money
            )}`,
            WX_Data.content.from_wxid
          );
          if (daili_list?.[WX_Data.content.from_wxid] != undefined) {
            msg = `代理:${daili_list?.[WX_Data.content.from_wxid]}\r\nwxid:${
              WX_Data.content.from_wxid
            }\r\n转了:${WX_Data.content.msg.money}`;
            vlw_api.SendTextMsg(msg, adminlist[0]);
          }
        } else {
          vlw_api.SendTextMsg(
            `卧槽出错了！请联系管理员查看`,
            WX_Data.content.from_wxid
          );
        }
      }
      break;
    }
    default: //其他消息
      // console.log(WX_Data);
      console.log(
        `${getFullDate()} ->${WX_Data.content.from_name}:${WX_Data.content.msg}`
      );
      break;
  }

  res.json({
    Code: 0, // 消息处理方式：-1中断推送 0忽略此消息 1拦截此消息
  });
  res.end();
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//获取链接信息
function geturl(WX_Data) {
  let regExp =
    /(https?):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;*]+[-A-Za-z0-9+&@#/%=~_*|]/g;

  let url_list;
  WX_Data.content.msg = WX_Data.content.msg.replace(/&amp;/g, "&"); //去除转义符
  while ((url_list = regExp.exec(WX_Data.content.msg))) {
    if (url_list[0].indexOf("https://bnzf.jd.com/") > -1) {
      //挖宝链接
      let inviter = getQueryString(url_list[0], "inviterId");
      let inviterCode = getQueryString(url_list[0], "inviterCode");

      if (!isItemInArray(obj.wabao, "inviter", inviter)) {
        add_order(
          "wabao",
          {
            No: obj.wabao.length + 1,
            inviter: inviter,
            inviteCode: inviterCode,
          },
          WX_Data,
          "xml"
        );
      } else {
        console.log(`${getFullDate()} ->挖宝inviter:${inviter}已经提交过`);
      }
    } else if (
      url_list[0].indexOf(
        "https://wqs.jd.com/sns/202210/20/make-money-shop/bridge.html"
      ) > -1
    ) {
      //大赢家
      let type = getQueryString(url_list[0], "type"); //获取类型
      let shareId = getQueryString(url_list[0], "shareId");
      let activeId = getQueryString(url_list[0], "activeId");

      if (type == "sign") {
        if (!isItemInArray(obj.dayingjia, "shareId", shareId)) {
          add_order(
            "dayingjia",
            {
              No: obj.dayingjia.length + 1,
              activeId: activeId,
              shareId: shareId,
            },
            WX_Data,
            "xml"
          );
        } else {
          console.log(`${getFullDate()} ->大赢家shareId:${shareId}已经提交过`);
        }
      }
    } else if (WX_Data.content.msg.includes("推推赚大钱")) {
      console.log(url_list[0]);
      let shareCode = getQueryString(url_list[0], "packetId");
      if (!isItemInArray(obj.tyt, "shareCode", shareCode)) {
        add_order(
          "tyt",
          {
            No: obj.tyt.length + 1,
            shareCode: shareCode,
          },
          WX_Data,
          "xml"
        );
      } else {
        console.log(
          `${getFullDate()} ->推一推shareCode:${shareCode}已经提交过`
        );
      }
    } else if (url_list[0].indexOf("S9sfBnz3XbRM76wSxkdecndL888") > -1) {
      //双11任务
      let shareType = getQueryString(url_list[0], "shareType"); //获取类型
      let inviteId = getQueryString(url_list[0], "inviteId");

      if (shareType == "team") {
        //日常组队
        if (!isItemInArray(obj.zudui, "inviteId", inviteId)) {
          add_order(
            "zudui",
            {
              No: obj.zudui.length + 1,
              inviteId: inviteId,
            },
            WX_Data,
            "xml"
          );
        } else
          console.log(`${getFullDate()} ->日常组队ID:${inviteId}已经提交过`);
      } else if (shareType == "expandHelp") {
        //膨胀红包
        if (!isItemInArray(obj.pengzhang, "inviteId", inviteId)) {
          add_order(
            "pengzhang",
            {
              No: obj.pengzhang.length + 1,
              inviteId: inviteId,
            },
            WX_Data,
            "xml"
          );
        } else
          console.log(`${getFullDate()} ->膨胀红包ID:${inviteId}已经提交过`);
      } else if (shareType == "taskHelp") {
        //金币助力
        if (!isItemInArray(obj.zhuli, "inviteId", inviteId)) {
          add_order(
            "zhuli",
            {
              No: obj.zhuli.length + 1,
              inviteId: inviteId,
            },
            WX_Data,
            "xml"
          );
        } else
          console.log(`${getFullDate()} ->金币助力ID:${inviteId}已经提交过`);
      }
    } else {
      console.log(
        `${getFullDate()} ->${WX_Data.content.from_name}: ${url_list[0]}`
      );
    }
  }
}

//口令解析 锦鲤群的接单
async function getjdcode(jCommand, WX_Data) {
  try {
    let jumpUrl = jCommand.data.jumpUrl;
    //群聊接单，私聊发口令
    if (
      !(
        WX_Data.Event == "EventPrivateChat" &&
        adminlist.indexOf(WX_Data.content.from_wxid) > -1
      )
    ) {
      if (jumpUrl.indexOf("https://happy.m.jd.com/babelDiy/") > -1) {
        //检测到锦鲤红包
        let redPacketId = getQueryString(jumpUrl, "asid");
        if (redPacketId == "") {
          msg = `这个锦鲤口令邀请码为空，订单提交失败\r\n${WX_Data.content.msg}`;
          if (WX_Data.Event == "EventGroupChat")
            vlw_api.SendGroupMsgAndAt(
              msg,
              WX_Data.content.from_wxid,
              WX_Data.content.from_group
            );
          else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
          return;
        }
        let orderType = WX_Data.content.msg.includes("测黑")
          ? "jinlitest"
          : "jinli";
        let jCommand = WX_Data.content.temp_msg.replace(/测黑/, "");
        if (!isItemInArray(obj[orderType], "redPacketId", redPacketId)) {
          add_order(
            orderType,
            {
              No: obj[orderType].length + 1,
              jCommand: jCommand,
              redPacketId: redPacketId,
            },
            WX_Data
          );
        } else
          console.log(`${getFullDate()} ->锦鲤红包ID:${redPacketId}已经提交过`);
      } else if (
        jumpUrl.indexOf(
          "https://h5.m.jd.com/pb/013158730/2wsSX2FdWJVsaAXLCSLUUH9qhGeL/index.html"
        ) > -1
      ) {
        // 检测到万人团
        let shareCode = getQueryString(jumpUrl, "shareCode");
        if (!isItemInArray(obj.wanrentuan, "shareCode", shareCode)) {
          add_order(
            "wanrentuan",
            {
              No: obj.wanrentuan.length + 1,
              jCommand: WX_Data.content.temp_msg,
              shareCode: shareCode,
            },
            WX_Data
          );
        } else
          console.log(`${getFullDate()} ->万人团助力:${shareCode}已经提交过`);
      } else if (jumpUrl.indexOf("S9sfBnz3XbRM76wSxkdecndL888") > -1) {
        //双11任务
        let shareType = getQueryString(jumpUrl, "shareType"); //获取类型
        let inviteId = getQueryString(jumpUrl, "inviteId");

        if (shareType == "team") {
          //日常组队
          if (!isItemInArray(obj.zudui, "inviteId", inviteId)) {
            add_order(
              "zudui",
              {
                No: obj.zudui.length + 1,
                jCommand: WX_Data.content.temp_msg,
                inviteId: inviteId,
              },
              WX_Data
            );
          } else
            console.log(`${getFullDate()} ->日常组队ID:${inviteId}已经提交过`);
        } else if (shareType == "expandHelp") {
          //膨胀红包
          if (!isItemInArray(obj.pengzhang, "inviteId", inviteId)) {
            add_order(
              "pengzhang",
              {
                No: obj.pengzhang.length + 1,
                jCommand: WX_Data.content.temp_msg,
                inviteId: inviteId,
              },
              WX_Data
            );
          } else
            console.log(`${getFullDate()} ->膨胀红包ID:${inviteId}已经提交过`);
        } else if (shareType == "taskHelp") {
          //金币助力
          if (!isItemInArray(obj.zhuli, "inviteId", inviteId)) {
            add_order(
              "zhuli",
              {
                No: obj.zhuli.length + 1,
                jCommand: WX_Data.content.temp_msg,
                inviteId: inviteId,
              },
              WX_Data
            );
          } else
            console.log(`${getFullDate()} ->金币助力ID:${inviteId}已经提交过`);
        }
      } else if (
        jumpUrl.indexOf(
          "https://wqs.jd.com/sns/202210/20/make-money-shop/bridge.html"
        ) > -1
      ) {
        //赚钱大赢家
        let type = getQueryString(jumpUrl, "type"); //获取类型
        let activeId = getQueryString(jumpUrl, "activeId"); //获取类型
        let shareId = getQueryString(jumpUrl, "shareId");

        if (type == "sign") {
          if (!isItemInArray(obj.dayingjia, "shareId", shareId)) {
            add_order(
              "dayingjia",
              {
                No: obj.dayingjia.length + 1,
                jCommand: WX_Data.content.temp_msg,
                activeId: activeId,
                shareId: shareId,
              },
              WX_Data
            );
          } else {
            console.log(
              `${getFullDate()} ->大赢家shareId:${shareId}已经提交过`
            );
          }
        }
      } else if (
        jumpUrl.indexOf("25wTmNQhkZY7UdAzu8cTBS9YfR1p/index.html") > -1
      ) {
        //年终奖
        let inviteId = getQueryString(jumpUrl, "inviteId"); //获取类型
        if (!isItemInArray(obj.nzj, "inviteId", inviteId)) {
          add_order(
            "nzj",
            {
              No: obj.nzj.length + 1,
              jCommand: WX_Data.content.temp_msg,
              inviteId: inviteId,
            },
            WX_Data
          );
        } else {
          console.log(
            `${getFullDate()} ->年终奖inviteId:${inviteId}已经提交过`
          );
        }
      } else if (
        jumpUrl.indexOf("x4pWW6pvDwW7DjxMmBbnzoub8J/index.html") > -1
      ) {
        //城城分现金
        let inviteId = getQueryString(jumpUrl, "inviteId"); //获取类型

        // if (!isItemInArray(obj.cc, "inviteId", inviteId)) {
        add_order(
          "cc",
          {
            No: obj.cc.length + 1,
            jCommand: WX_Data.content.temp_msg,
            inviteId: inviteId,
          },
          WX_Data
        );
        // } else {
        //   console.log(
        //     `${getFullDate()} ->城城分现金inviteId:${inviteId}已经提交过`
        //   );
        // }
      } else if (jumpUrl.indexOf("signinhb_new/index.html") > -1) {
        while (jumpUrl.includes("%")) jumpUrl = decodeURIComponent(jumpUrl);
        //京喜签到
        let smp = getQueryString(jumpUrl, "smp"); //获取类型

        if (!isItemInArray(obj.jxqd, "smp", smp)) {
          add_order(
            "jxqd",
            {
              No: obj.jxqd.length + 1,
              jCommand: WX_Data.content.temp_msg,
              smp: smp,
            },
            WX_Data
          );
        } else {
          console.log(`${getFullDate()} ->京喜签到smp:${smp}已经提交过`);
        }
      } else if (
        jumpUrl.includes("JDH_Marketing/activity/receiveRedEnvelope")
      ) {
        //京东健康
        let shareParam = getQueryString(jumpUrl, "shareParam"); //获取类型

        if (!isItemInArray(obj.jkhb, "shareParam", shareParam)) {
          add_order(
            "jkhb",
            {
              No: obj.jkhb.length + 1,
              jCommand: WX_Data.content.temp_msg,
              shareParam: shareParam,
            },
            WX_Data
          );
        } else {
          console.log(
            `${getFullDate()} ->京东健康红包shareParam:${shareParam}已经提交过`
          );
        }
      }
    } else {
      jumpUrl = new URL(jCommand.data.jumpUrl);
      let msg = `活动标题:${jCommand.data.title}\r\n用户昵称:${jCommand.data.userName}\r\n活动链接:${jCommand.data.jumpUrl}`;
      let keylist = [
        "activityId",
        "inviter",
        "asid",
        "inviteId",
        "friendUuid",
        "shopid",
      ];
      for (let query of jumpUrl.searchParams)
        if (keylist.indexOf(query[0]) > -1)
          msg += `\r\n${query[0]}:${query[1]}`;
      vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
    }
  } catch (e) {
    console.log(e);
  }
}

////////////////////////////////////////////各种子程序////////////////////////////////////////////////////////////
//获取URL参数文本
function getQueryString(url, name) {
  let reg = new RegExp("(^|\\?|&)" + name + "=([^&]*)(&|$)", "i");
  let r = url.match(reg);
  if (r != null) return decodeURIComponent(r[2]);
  return null;
}

//格式化文本
const decodeString = (str) => {
  str = str
    .replace(/\[emoji=/g, "")
    .replace(/\]/g, "")
    .replaceAll("\\\\", "\\");
  return str.replace(/\\u[\dA-F]{4}/gi, (unicode) => {
    return String.fromCharCode(parseInt(unicode.replace(/\\u/g, ""), 16));
  });
};

/// 读取文件
function loadFromFile(fileName) {
  let fileText = [];
  try {
    if (fs.existsSync(fileName)) {
      fileText = fs.readFileSync(fileName);
      fileText = JSON.parse(fileText);
    }
  } catch (error) {
    fileText = [];
  }
  return fileText;
}

// 读取TXT
function loadFromFileTest(fileName) {
  let fileText = "";
  try {
    if (fs.existsSync(fileName)) {
      fileText = fs.readFileSync(fileName);
    }
  } catch (error) {
    fileText = "";
  }
  return fileText;
}

//别名获取变量
function get_Command(Command_text, Command_type = "order") {
  for (let key of Object.entries(BOT_Command[Command_type]))
    if (key[1].indexOf(Command_text) > -1) return key[0];
  return false;
}

//数组元素是否存在
function isItemInArray(array, array_type, item) {
  for (var i = 0; i < array.length; i++) {
    if (array[i][array_type] == item) {
      return true;
    }
  }
  return false;
}

//正则匹配
function get_regExp_result(WX_Data, regExp_test, regExp_test2 = "") {
  let regExp = new RegExp(`(.*)${regExp_test}(.*)`, "i");
  if (regExp_test2 != "") regExp = new RegExp(regExp_test2, "i");
  let regExp_result =
    WX_Data.content.msg.match(regExp)?.[2] ||
    WX_Data.content.msg.match(regExp)?.[1];
  console.log(`${getFullDate()} -> 匹配成功,成功匹配内容:${regExp_result}`);
  return regExp_result;
}
////////////////////////////////////////////////关于添加订单//////////////////////////////////////////////////////////

/// 添加新订单
function add_order(order_type, add_orderarr, WX_Data, add_type = "") {
  let order = {
    status: "false",
    timestamp: getFullDate(),
    finish_timestamp: "",
    wxid: WX_Data.content.from_wxid,
    user: WX_Data.content.from_name,
  };
  //群聊权鉴
  if (WX_Data.Event == "EventGroupChat") {
    if (qunlist[order_type] == undefined) qunlist[order_type] = [];
    if (qunlist[order_type].indexOf(WX_Data.content.from_group) == -1) {
      console.log(
        `${getFullDate()} -> 当前群聊:${
          WX_Data.content.from_group_name
        },无权限添加${BOT_Command.order[order_type][0]}类型订单`
      );
      return;
    }
    order.Group = WX_Data.content.from_group;
  }
  if (!config.Enable[order_type]) {
    msg = `\n现在${BOT_Command.order[order_type][0]}不接单，晚点再来看看或联系管理员接单。`;
    if (WX_Data.Event == "EventGroupChat")
      vlw_api.SendGroupMsgAndAt(
        msg,
        WX_Data.content.from_wxid,
        WX_Data.content.from_group
      );
    else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
    return;
  }

  // console.log(`当前订单类型:${order_type}`);
  // if (order_type == "zhuli") {
  //   if (!query_user_baipiaoguai(WX_Data.content.from_wxid)) {
  //     msg = `\n昨天和今天没有提交过其他订单！禁止白嫖任务助力！！！`;
  //     if (WX_Data.Event == "EventGroupChat")
  //       vlw_api.SendGroupMsgAndAt(
  //         msg,
  //         WX_Data.content.from_wxid,
  //         WX_Data.content.from_group
  //       );
  //     else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
  //     return;
  //   }
  // }

  //预付款
  if (Price[order_type] > query_money(WX_Data.content.from_wxid)) {
    console.log(
      `${getFullDate()} ->当前用户:${
        WX_Data.content.from_name
      },余额${query_money(WX_Data.content.from_wxid)}块,${
        BOT_Command.order[order_type][0]
      }订单所需金额${Price[order_type]}块,订单提交失败`
    );
    msg = `\n余额不足[心碎],【${
      BOT_Command.order[order_type][0]
    }】提交失败\n项目需要:${Price[order_type]}[爆竹]\n当前剩余:${query_money(
      WX_Data.content.from_wxid
    )}[爆竹]\n注意：请充值后重新发口令\n注意：请充值后重新发口令`;
    // if (add_type == "xml") {
    //   msg = `\n当前订单提交失败！！！[爆竹]余额不足，请及时充值！\n助力码:${
    //     add_orderarr.inviterCode ||
    //     add_orderarr.shareCode ||
    //     add_orderarr.group_id ||
    //     add_orderarr.inviteId
    //   }`;
    // } else {
    //   msg = `\n当前订单提交失败！！！[爆竹]余额不足，请及时充值！\n${WX_Data.content.msg}`;
    // }
    if (WX_Data.Event == "EventGroupChat")
      vlw_api.SendGroupMsgAndAt(
        msg,
        WX_Data.content.from_wxid,
        WX_Data.content.from_group
      );
    else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
    return;
  } else {
    change_user_money(WX_Data, "subtract", Price[order_type] * 1);
  }

  Object.assign(add_orderarr, order);
  obj[order_type].push(add_orderarr);
  if (order_type == "jxqd") {
    let new_jxqd = JSON.parse(JSON.stringify(add_orderarr));
    let new_jxqd2 = JSON.parse(JSON.stringify(add_orderarr));
    jxqd_vx.push(new_jxqd);
    jxqd_qq.push(new_jxqd2);
    fs.writeFile(
      "./js/jxqd_vx.json",
      JSON.stringify(jxqd_vx, "", "\t"),
      (err) => {
        console.log(`京喜签到VX写入成功`);
      }
    );
    fs.writeFile(
      "./js/jxqd_qq.json",
      JSON.stringify(jxqd_qq, "", "\t"),
      (err) => {
        console.log(`京喜签到VX写入成功`);
      }
    );
  }
  fs.writeFile(
    "./js/" + order_type + ".json",
    JSON.stringify(obj[order_type], "", "\t"),
    () => {
      console.log(
        `${getFullDate()} ->订单号:${add_orderarr.No},${
          BOT_Command.order[order_type][0]
        }邀请码:${
          add_orderarr.redPacketId ||
          add_orderarr.inviteCode ||
          add_orderarr.shareCode ||
          add_orderarr.group_id ||
          add_orderarr.inviteId ||
          add_orderarr.inviter ||
          add_orderarr.shareId ||
          add_orderarr.shareParam ||
          add_orderarr.smp ||
          JSON.stringify(add_orderarr)
        },写入成功`
      );
    }
  );

  //发送提交信息
  if (add_orderarr.jCommand != undefined) {
    msg = `【${BOT_Command.order[order_type][0]}】订单提交成功\r\n${
      add_orderarr.jCommand
    }\r\n邀请码:${
      add_orderarr.smp ||
      add_orderarr.redPacketId ||
      add_orderarr.inviteCode ||
      add_orderarr.shareCode ||
      add_orderarr.group_id ||
      add_orderarr.inviteId ||
      add_orderarr.inviter ||
      add_orderarr.shareId ||
      add_orderarr.shareParam ||
      "undefined"
    }\r\n扣除${Price[order_type]}[爆竹]\r\n剩余:${query_money(
      WX_Data.content.from_wxid
    )}[爆竹]\r\n注意：助力活动都需成本，只保人头，感谢支持~\r\n时间:${getFullDate()}`;
  } else {
    msg = `【${BOT_Command.order[order_type][0]}】订单提交成功\r\n邀请码:${
      add_orderarr.smp ||
      add_orderarr.jCommand ||
      add_orderarr.redPacketId ||
      add_orderarr.inviteCode ||
      add_orderarr.shareCode ||
      add_orderarr.group_id ||
      add_orderarr.inviteId ||
      add_orderarr.inviter ||
      add_orderarr.shareId ||
      add_orderarr.shareParam ||
      "undefined"
    }\r\n扣除${Price[order_type]}[爆竹]\r\n剩余:${query_money(
      WX_Data.content.from_wxid
    )}[爆竹]\r\n注意：助力活动都需成本，只保人头，感谢支持~\r\n时间:${getFullDate()}`;
  }

  reply_send(msg, WX_Data, "_order");
}
///////////////////////////////////////////////config配置修改//////////////////////////////////////////////////////////////////////////
//更改接单群
function change_group(order_type, command, WX_Data) {
  if (config.qunlist[order_type] == undefined) config.qunlist[order_type] = [];

  if (command == "add") {
    if (config.qunlist[order_type].indexOf(WX_Data.content.from_group) == -1)
      config.qunlist[order_type].push(WX_Data.content.from_group);
  } else {
    if (config.qunlist[order_type].indexOf(WX_Data.content.from_group) > -1)
      config.qunlist[order_type].splice(
        config.qunlist[order_type].indexOf(WX_Data.content.from_group),
        1
      );
  }
  change_config2();
  msg = `${WX_Data.content.msg}项目成功\r\n时间:${getFullDate()}`;
  if (WX_Data.Event == "EventGroupChat")
    vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
  else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
}

//添加完成回复群列表
function change_reply_group(order_type, command, WX_Data) {
  if (config.reply_Group[order_type + "_Group"] == undefined)
    config.reply_Group[order_type + "_Group"] = [];

  if (command == "add") {
    if (
      config.reply_Group[order_type + "_Group"].indexOf(
        WX_Data.content.from_group
      ) == -1
    )
      config.reply_Group[order_type + "_Group"].push(
        WX_Data.content.from_group
      );
  } else {
    if (
      config.reply_Group[order_type + "_Group"].indexOf(
        WX_Data.content.from_group
      ) > -1
    )
      config.reply_Group[order_type + "_Group"].splice(
        config.reply_Group[order_type + "_Group"].indexOf(
          WX_Data.content.from_group
        ),
        1
      );
  }
  change_config2();
  msg = `${WX_Data.content.msg}成功\r\n时间:${getFullDate()}`;
  if (WX_Data.Event == "EventGroupChat")
    vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
  else vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
}

function change_config2() {
  fs.writeFile("./config.json", JSON.stringify(config, "", "\t"), () => {
    //重新刷新变量
    config = loadFromFile("./config.json") || [];

    Price = config.Price;
    adminlist = config.adminlist;
    qunlist = config.qunlist;

    console.log(`${getFullDate()} -> config配置文件修改成功,更新成功`);
  });
}

///////////////////////////////////////订单相关操作////////////////////////////////////////////////////////////
//订单清空
function order_clean(order_type) {
  let temp_order = [];
  let Path_fileName = getNowDate();

  if (!fs.existsSync(`./js/${Path_fileName}`)) {
    console.log(`${getFullDate()} ->文件不存在,新建${Path_fileName}文件夹`);
    fs.mkdirSync(`./js/${Path_fileName}`);
  }

  if (!fs.existsSync(`./js/${Path_fileName}/${order_type}.json`)) {
    console.log(
      `${getFullDate()} -> 旧订单文件不存在,新建${
        BOT_Command.order[order_type][0]
      }订单文件`
    );
    temp_order = obj[order_type];
  } else {
    console.log(
      `${getFullDate()} ->旧${
        BOT_Command.order[order_type][0]
      }订单文件存在,将合并订单`
    );
    temp_order = loadFromFile(`./js/${Path_fileName}/${order_type}.json`);
    for (let order of obj[order_type]) temp_order.push(order);
  }

  fs.writeFile(
    `./js/${Path_fileName}/${order_type}.json`,
    JSON.stringify(temp_order, "", "\t"),
    () => {
      console.log(
        `${getFullDate()} ->旧${
          BOT_Command.order[order_type][0]
        }订单文件写入成功`
      );
      obj[order_type] = [];
      if (fs.existsSync(`./js/${order_type}.json`)) {
        fs.unlink(`./js/${order_type}.json`, (err, data) => {
          if (err) {
            console.log(err);
          } else {
            console.log(
              `${getFullDate()} ->旧${
                BOT_Command.order[order_type][0]
              }订单文件删除文件成功`
            );
          }
        });
      }
    }
  );
}

///////////////////////////////////////////////关于各种查询////////////////////////////////////////////////////////////////////
/// 用户订单查询
function query_user_order(order_type, order_arr, wxid, time = "今天") {
  let order_num = 0;
  let suc_order_num = 0;
  for (let order of order_arr) {
    if (order.wxid == wxid) {
      order_num++;
      if (order.status == "true") suc_order_num++;
    }
  }

  msg = `${time}【${order_type}】订单:\r\n你提交了-->${order_num}个\r\n已经完成-->${suc_order_num}个->使用了${(
    suc_order_num *
    Price[get_Command(order_type)] *
    1
  ).toFixed(2)} [爆竹]\r\n`;
  return msg;
}

/// 管理员查询收益
function query_income() {
  let msg = "";
  let income = 0;

  Object.keys(BOT_Command.order).forEach((order_type) => {
    let suc_order_num = 0;
    let money = 0;
    if (obj[order_type].length != 0) {
      for (let order of obj[order_type])
        if (order.status == "true") suc_order_num++;
      money = suc_order_num * Price[order_type] * 1;
      msg += `今天${BOT_Command.order[order_type][0]}详细:\r\n提交订单数量:${obj[order_type].length}个\r\n完成订单数量:${suc_order_num}个\r\n预计收入:${money}块\r\n\r\n`;
      income += money;
    }
  });
  msg += `\r\n预计总收入:${income * 1}块`;
  return msg;
}

/// 管理员订单详细查询
function query_admin_order(order_type, order_arr) {
  let suc_order_num = 0;
  let order_myMap = new Map(),
    suc_order_myMap = new Map(),
    msg = "";

  for (let item of order_arr) {
    order_myMap.set(item.user, 0);
    suc_order_myMap.set(item.user, 0);
  }

  for (let order of order_arr) {
    order_myMap.set(order.user, parseInt(order_myMap.get(order.user)) + 1);
    if (order.status == "true") {
      suc_order_myMap.set(
        order.user,
        parseInt(suc_order_myMap.get(order.user)) + 1
      );
      suc_order_num++;
    }
  }
  for (let key of order_myMap.keys()) {
    msg += `${key}---> 提交了${order_myMap.get(
      key
    )}个,完成${suc_order_myMap.get(key)}个\r\n`;
  }
  msg = `今天${order_type}详细:\r\n${msg}当前数量:${
    order_arr.length
  }个\r\n预计收入${fomatFloat(
    suc_order_num * Price[get_Command(order_type)],
    2
  )}块`;
  // console.log(msg)
  return msg;
}

function fomatFloat(src, pos) {
  return Math.round(src * Math.pow(10, pos)) / Math.pow(10, pos);
}

/// 查询价格
function query_price(type = "") {
  msg = `当前${type}价格:`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    msg += `\r\n${BOT_Command.order[order_type][0]}-->${
      type == "代理" ? daili_Price[order_type] : Price[order_type]
    }块`;
  });
  return msg;
}

/// 查询群状态
function query_Group_status(WX_Data) {
  msg = `群名:${WX_Data.content.from_group_name}\r\nwxid:${WX_Data.content.from_group}\r\n接单项目:\r\n`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    if (config.qunlist[order_type] == undefined)
      config.qunlist[order_type] = [];
    if (config.qunlist[order_type].indexOf(WX_Data.content.from_group) > -1) {
      msg += `${BOT_Command.order[order_type][0]}\r\n`;
    }
  });
  msg += `完成回复:\r\n`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    if (config.reply_Group[order_type + "_Group"] == undefined)
      config.reply_Group[order_type + "_Group"] = [];
    if (
      config.reply_Group[order_type + "_Group"].indexOf(
        WX_Data.content.from_group
      ) > -1
    ) {
      msg += `${BOT_Command.order[order_type][0]}\r\n`;
    }
  });
  return msg;
}

//寻找白嫖怪
function query_user_baipiaoguai(wxid) {
  let orderTypeList = [
    "锦鲤",
    "挖宝",
    "助力",
    "组队",
    "膨胀",
    "大赢家",
    "红包团",
  ];
  let haveOrder = false;
  for (let orderType of orderTypeList) {
    let orderList = obj[get_Command(orderType)];
    if (isItemInArray(orderList, "wxid", wxid)) {
      haveOrder = true;
      break;
    }
    if (
      fs.existsSync(`./js/${getYesterday()}/${get_Command(orderType)}.json`)
    ) {
      let yesterdayOrderList = loadFromFile(
        `./js/${getYesterday()}/${get_Command(orderType)}.json`
      );
      if (isItemInArray(yesterdayOrderList, "wxid", wxid)) {
        haveOrder = true;
        break;
      }
    }
  }
  return haveOrder;
}

/// 一键查询代理账单 普通用户用不了
function query_user_allorder(wxid) {
  let msg = `${getNowDate()}代理账单\r\n`,
    income = 0;

  Object.keys(obj).forEach(function (order_type) {
    if (obj?.[order_type] == undefined) return;
    let order_num = 0,
      suc_order_num = 0;
    let money = 0;
    let order_arr = obj[order_type];
    if (order_type != "dayingjia") {
      for (let order of order_arr) {
        if (order.wxid == wxid) {
          order_num++;
          if (order.status == "true") suc_order_num++;
        }
      }
    } else {
      let dayingjia_arr = [];
      if (fs.existsSync(`./js/${getNowDate()}/dayingjia.json`))
        dayingjia_arr = loadFromFile(`./js/${getNowDate()}/dayingjia.json`);

      for (let order of dayingjia_arr) {
        if (order.wxid == wxid) {
          order_num++;
          if (order.status == "true") suc_order_num++;
        }
      }
    }
    money = suc_order_num * daili_Price?.[order_type];
    if (order_num != 0) {
      msg += `${
        BOT_Command.order[order_type][0]
      }:\r\n提交-->${order_num}个\r\n完成-->${suc_order_num}个->一共${fomatFloat(
        money,
        2
      )} [爆竹]\r\n`;
      income += money;
    }
  });
  msg += `一共要:${fomatFloat(income, 2)}[爆竹]`;
  return msg;
}

function query_daili_order_alltime(wxid, fileName) {
  let msg = `${fileName} 代理账单\r\n`,
    income = 0;
  let order_path = `./js/${fileName}`;
  if (!fs.existsSync(order_path)) return msg;

  Object.keys(BOT_Command.order).forEach(function (order_type) {
    if (obj?.[order_type] == undefined) return;
    let order_num = 0,
      suc_order_num = 0;
    let money = 0;
    let order_arr = loadFromFile(`${order_path}/${order_type}.json`) || [];

    // for (let order of order_arr) {
    order_arr.forEach((order) => {
      if (order.wxid == wxid) {
        order_num++;
        if (order.status == "true") suc_order_num++;
      }
    });

    if (order_num != 0) {
      money = suc_order_num * daili_Price?.[order_type];
      msg += `${
        BOT_Command.order[order_type][0]
      }:\r\n提交-->${order_num}个\r\n完成-->${suc_order_num}个->一共${fomatFloat(
        money,
        2
      )} [爆竹]\r\n`;
      income += money;
    }
  });
  msg += `一共要:${fomatFloat(income, 2)}[爆竹]`;
  return msg;
}

//查询接单状态
function query_order_Enable() {
  let msg = "";
  msg += `------  接单状态  ------ \r\n`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    msg += `${BOT_Command.order[order_type][0]} —— ${
      config.Enable[order_type] ? "开" : "关"
    }\r\n`;
  });
  return msg;
}

//////////////////////////////////////余额相关////////////////////////////////////////////////////////////////////////////////////
/// 查询余额
function query_money(wxid) {
  let user_money = 0;
  for (var i = 0; i < user_paylist.length; i++) {
    if (user_paylist[i]["wxid"] == wxid) {
      user_money = user_paylist[i]["money"];
      break;
    }
  }
  return Number(user_money).toFixed(2);
}

//修改余额 add subtract
function change_user_money(WX_Data, type, money) {
  let first = false;
  money = money * 1;
  let user_money = 0;
  for (var i = 0; i < user_paylist.length; i++) {
    if (user_paylist[i]["wxid"] == WX_Data.content.from_wxid) {
      if (type == "add")
        user_paylist[i]["money"] = user_paylist[i]["money"] + money;
      else if (type == "subtract")
        user_paylist[i]["money"] = user_paylist[i]["money"] - money;
      else if (type == "change") user_paylist[i]["money"] = money;
      user_money = user_paylist[i]["money"];
      first = true;
      break;
    }
  }

  if (!first) {
    user_paylist.push({
      user: WX_Data.content.from_name,
      wxid: WX_Data.content.from_wxid,
      money: money,
    });
    user_money = money;
  }

  fs.writeFile(
    "./js/user_paylist.json",
    JSON.stringify(user_paylist, "", "\t"),
    () => {
      console.log(
        `${getFullDate()} ->用户:${WX_Data.content.from_name},wxid:${
          WX_Data.content.from_wxid
        },剩余金额:${user_money},写入成功`
      );
    }
  );
  return user_money * 1;
}

// 一键退单
function chargeback_user_order(order_type, WX_Data) {
  console.log(`${getFullDate()} ->开始核对退单`);
  let order_arr = obj[order_type];
  let order_myMap = new Map(),
    wxid_myMap = new Map(),
    suc_order_myMap = new Map(),
    msg = "";

  for (let item of order_arr) {
    order_myMap.set(item.user, 0);
    wxid_myMap.set(item.user, item.wxid);
    suc_order_myMap.set(item.user, 0);
  }

  for (let order of order_arr) {
    order_myMap.set(order.user, parseInt(order_myMap.get(order.user)) + 1);
    if (order.status == "true") {
      suc_order_myMap.set(
        order.user,
        parseInt(suc_order_myMap.get(order.user)) + 1
      );
    }
  }

  for (let key of order_myMap.keys()) {
    if (order_myMap.get(key) - suc_order_myMap.get(key) > 0) {
      let chargeback_WX_Data = {
        content: { from_wxid: wxid_myMap.get(key), from_name: key },
      };

      change_user_money(
        chargeback_WX_Data,
        "add",
        (order_myMap.get(key) - suc_order_myMap.get(key)) *
          Price[order_type] *
          1
      );

      msg = `用户:${key}-> 今日${
        BOT_Command.order[order_type][0]
      }:\r\n提交了${order_myMap.get(key)}个,未完成${
        order_myMap.get(key) - suc_order_myMap.get(key)
      }个，该退还${
        (order_myMap.get(key) - suc_order_myMap.get(key)) * Price[order_type]
      }[爆竹]\r\n滴滴滴,当前剩余${query_money(wxid_myMap.get(key))}[爆竹]`;

      console.log(msg);
      // vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
    } else {
      console.log(`${getFullDate()} ->用户:${key}订单都做完了,不用退单`);
    }
  }
}

///////////////////////////////////关于各种回复的程序/////////////////////////////////////////////////
//查询回复状态
function query_reply() {
  let msg = "";
  // msg += "----------总开关----------\r\n";
  msg += `------  订单提交回执  ------ \r\n`;
  msg += `私聊  ---${config.reply.Private_order ? "开" : "关"}\r\n`;
  msg += `群聊  ---${config.reply.Group_order ? "开" : "关"}\r\n`;
  msg += `------  订单查询回执  ------ \r\n`;
  msg += `私聊  ---${config.reply.Private_query ? "开" : "关"}\r\n`;
  msg += `群聊  ---${config.reply.Group_query ? "开" : "关"}\r\n`;
  msg += `------  私聊完成回执  ------ \r\n`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    msg += `【${BOT_Command.order[order_type][0]}】  ---${
      config.reply[order_type] ? "开" : "关"
    }\r\n`;
  });
  msg += `------  群聊完成回执  ------ \r\n`;
  Object.keys(BOT_Command.order).forEach((order_type) => {
    msg += `【${BOT_Command.order[order_type][0]}】  ---${
      config.reply_Group[order_type] ? "开" : "关"
    }\r\n`;
  });
  // Object.keys(config.reply).forEach(function (key) {
  //   if (BOT_Command.order[key] != undefined) {
  //     msg += `${BOT_Command.order[key][0]} —— ${
  //       config.reply[key] ? "开" : "关"
  //     }\r\n`;
  //   }
  // });
  return msg;
}

//发送回复
function reply_send(msg, WX_Data, reply_type = "") {
  //reply_type类型 订单 和 查询
  //_order 提交订单 _query 查询 ""普通回复
  if (WX_Data.Event == "EventGroupChat") {
    if (config.reply["Group" + reply_type]) {
      if (reply_type == "_order") {
        //提交订单 不艾特人
        vlw_api.SendTextMsg(msg, WX_Data.content.from_group);
      } else {
        //查询和提交出错艾特指定的人
        vlw_api.SendGroupMsgAndAt(
          "\r\n" + msg,
          WX_Data.content.from_wxid,
          WX_Data.content.from_group
        );
      }
    } else console.log(`${getFullDate()} -> 群聊暂时关闭回复`);
  } else {
    if (config.reply["Private" + reply_type]) {
      vlw_api.SendTextMsg(msg, WX_Data.content.from_wxid);
    } else console.log(`${getFullDate()} -> 私聊暂时关闭回复`);
  }
}

//订单完成反馈
function reply_order_Complete(req) {
  if (req.query.status == "true") {
    msg = `【${BOT_Command.order[req.query.key][0]}】订单完成\r\n邀请码:${
      obj[req.query.key][req.query.no - 1].jCommand ||
      obj[req.query.key][req.query.no - 1].redPacketId ||
      obj[req.query.key][req.query.no - 1].inviteCode ||
      obj[req.query.key][req.query.no - 1].shareCode ||
      obj[req.query.key][req.query.no - 1].group_id ||
      obj[req.query.key][req.query.no - 1].inviteId ||
      obj[req.query.key][req.query.no - 1].inviter ||
      obj[req.query.key][req.query.no - 1].shareId ||
      "undefined"
    }\r\n时间:${getFullDate()}`;

    //判断订单是否群聊
    if (obj[req.query.key][req.query.no - 1].Group != undefined) {
      //群聊的单独开关判断
      if (config.reply_Group[req.query.key]) {
        if (
          config.reply_Group[req.query.key + "_Group"].indexOf(
            obj[req.query.key][req.query.no - 1].Group
          ) > -1
        ) {
          vlw_api.SendTextMsg(msg, obj[req.query.key][req.query.no - 1].Group);
        }
      } else {
        console.log(
          `${getFullDate()} -> ${
            BOT_Command.order[req.query.key][0]
          }订单，群完成回执不开启`
        );
        return;
      }
    } else {
      if (config.reply[req.query.key]) {
        vlw_api.SendTextMsg(msg, obj[req.query.key][req.query.no - 1].wxid);
      } else {
        console.log(
          `${getFullDate()} ->${
            BOT_Command.order[req.query.key][0]
          }订单完成,私聊完成不开启`
        );
      }
    }
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//备份余额
function bakUserPayList() {
  let newDirName = `./js/${getNowDate()}`;
  if (!fs.existsSync(newDirName)) {
    fs.mkdirSync(newDirName);
  }

  let orderFileName = `${newDirName}/user_paylist_${+new Date()}.json`;

  // File destination.txt will be created or overwritten by default.
  fs.copyFile("./js/user_paylist.json", orderFileName, (err) => {
    if (err) throw err;
    console.log("user_paylist 备份完成");
  });
}
//备份订单
function bakOrderList() {
  let newDirName = `./js/${getNowDate()}`;
  if (!fs.existsSync(newDirName)) {
    fs.mkdirSync(newDirName);
  }

  Object.keys(BOT_Command.order).forEach((order_type) => {
    if (!fs.existsSync(`./js/${order_type}.json`)) return;
    let newOrderDirName = `./js/${getNowDate()}/${order_type}`;
    if (!fs.existsSync(newOrderDirName)) {
      fs.mkdirSync(newOrderDirName);
    }
    let orderFileName = `${newOrderDirName}/${order_type}_${+new Date()}.json`;

    fs.copyFile(`./js/${order_type}.json`, orderFileName, (err) => {
      if (err) throw err;
      console.log(`${BOT_Command.order[order_type][0]} 备份完成`);
    });
  });
}

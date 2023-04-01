const express = require('express')
const https = require('https')
const path = require('path')
const request = require('request');
const { createProxyMiddleware } = require("http-proxy-middleware");
const expressWebSocket = require("express-ws");
const websocketStream = require('websocket-stream/stream');

const app = express();
const port = 3000

expressWebSocket(app, null, {
  perMessageDeflate: false
});
app.ws('*', proxyWsStream);
app.get('/api/roomData', getRoomData);
app.get('/api/liveData', getLiveData);
app.get(/\/api/, proxyLiveStream);
app.use('/', express.static(path.join(__dirname, './public')))

function getApiData(url) {
  return new Promise((resolve, reject) => {
    request(url, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        resolve(JSON.parse(body))
      } else {
        reject(error)
      }
    })
  })
}

async function getRoomData(req, res) {
  const roomid = Number(req.query.roomid)
  try {
    const roomData = await getApiData(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${ roomid }`)
    if (roomData.code !== 0) {
      res.writeHead(500);
      res.end(JSON.stringify({ code: 0 }))
      return
    }
    const roomInfo = {
      cid: roomData.data.room_info.room_id,
      sid: roomData.data.room_info.short_id,
      uid: roomData.data.room_info.uid,
      title: roomData.data.room_info.title,
      uname: roomData.data.anchor_info.base_info.uname,
      live_status: roomData.data.room_info.live_status,
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(roomInfo))
  } catch (e) {
    res.writeHead(500);
    res.end(e.message)
  }
}

async function getLiveData(req, res) {
  const cid = req.query.cid
  const qn = req.query.qn
  const liveData = await getApiData(`https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomPlayInfo?room_id=${ cid }&play_url=1&mask=1&qn=${qn}&platform=web`)
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(liveData))
}

function proxyLiveStream(req, res) {
  req.headers.referer = 'https://live.bilibili.com'
  req.headers["user-agent"] = "-"
  delete req.headers.host;
  const reg = /http.*.bilivideo.com/g
  // const target = 'https://cn-sccd-ct-01-08.bilivideo.com'
  const target = req.url.match(reg)[0]
  const oTarget =  `/api/${target}`
  const fn = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [oTarget]: ''
    }
  })
  fn(req, res)
}

function proxyWsStream(ws, req) {
  const stream = websocketStream(ws, {
    binary: true,
  });
  let url = req.url;
  if (url.indexOf('/api/') !== -1) {
    url = new Buffer.from(req.query.url, 'base64').toString(); // base64解码
    req.headers.referer = 'https://live.bilibili.com'
    req.headers["user-agent"] = "-"
    delete req.headers.host;
    console.log('proxy url', url)
    // 创建代理请求
    const rq = https.request(url, {
      method: req.method,
      headers: req.headers,
    }, (ims) => {
      // 代理响应体
      try {
        ims.pipe(stream);
      } catch (e) {
        console.log('ims.pipe error', e)
      }
    })
    // 发送请求
    try {
      req.pipe(rq);
    } catch (e) {
      console.log('req.pipe error', e)
    }
  }
}

app.listen(port, () => {
  console.log(`listen on: http://localhost:${ port }`);
})

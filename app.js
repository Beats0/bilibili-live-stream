const fs = require('fs')
const http = require('http')
const request = require('request');
const queryString = require('querystring')
const httpProxyMiddle = require('http-proxy-middleware');


const port = 3000

const app = http.createServer(async (req, res) => {
  if (req.url === '/') {
    renderIndex(req, res)
  } else if (req.url.endsWith('.js')) {
    renderJs(req, res)
  } else if (req.url.startsWith('/api/roomData')) {
    await getRoomData(req, res)
  } else if (req.url.startsWith('/api/liveData')) {
    await getLiveData(req, res)
  } else if (req.url.startsWith('/api')) {
    proxyLiveStream(req, res)
  } else {
    res.end('404')
  }
})

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

function renderIndex(req, res) {
  let data = fs.readFileSync('./public/index.html')
  res.end(data)
}

function renderJs(req, res) {
  let data = fs.readFileSync('./public' + req.url)
  res.end(data)
}

async function getRoomData(req, res) {
  const urlObj = queryString.parse(req.url.replace('/api/roomData?', ''))
  const roomid = Number(urlObj.roomid) || 5050
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
  const urlObj = queryString.parse(req.url.replace('/api/liveData?', ''))
  const cid = Number(urlObj.cid)
  const liveData = await getApiData(`https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomPlayInfo?room_id=${ cid }&play_url=1&mask=1&qn=20000&platform=web`)
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
  const fn = httpProxyMiddle.createProxyMiddleware({
    target,
    changeOrigin: true, //跨域
    pathRewrite: {
      [oTarget]: ''
    }
  })
  fn(req, res)
}

app.listen(port, () => {
  console.log(`listen on: http://localhost:${port}`);
})

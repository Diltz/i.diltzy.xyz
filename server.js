// i.diltzy.xyz
// server

const fs = require("fs")
const crypto = require("crypto")
const dotenv = require("dotenv")
const express = require("express")
const helmet = require("helmet")
const express_fileupload = require("express-fileupload")
const ratelimit = require("express-rate-limit")
const compression = require('compression');
const path = require("path")
const fastStatic = require('fast-static');

const envConfig = dotenv.config().parsed
var currentUploadKeys = []
currentUploadKeys[envConfig.UPLOAD_MASTER_KEY] = true

function isUploadKeyValid(key) {
    return currentUploadKeys[key] != null
}

const app = express()
const APP_LIMITS = ratelimit({
	windowMs: 5 * 60 * 1000, // 15 minutes
	max: 5, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests. Try again later",
    keyGenerator: (request, response) => request.headers["CF-Connecting-IP"] || request.ip,
    skip: function(request, response){
        return isUploadKeyValid(request.headers["uploadKey"])
    }
})

// app usage

//app.set('trust proxy', 1)
app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(helmet())
app.use(express_fileupload({
    limits: { fileSize: 100 * 1024 * 1024 },
}))

// app static

app.use(fastStatic.use(__dirname + "/media"))
app.use(express.static(__dirname + "/public"))

//

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

async function generateName(type) {
    var newName

    while (newName == null) {
        let name = crypto.randomUUID().toString()
        let isExist = fs.existsSync(`${__dirname}/media/${name}.${type}`)

        if (!isExist) {
            newName = name
        }
    }

    return newName
}

// pages

app.get("/", async function(req, res){
    res.sendFile(__dirname + "/public/html/home.html")
})

app.get("/generator", async function(req, res){
    res.sendFile(__dirname + "/public/html/generator.html")
})

app.get("/upload", async function(req, res){
    res.sendFile(__dirname + "/public/html/upload.html")
})

app.get("/anonymous", async function(req, res) {
    let files = await fs.readdirSync(__dirname + "/media/anonymous")
    let randomAnonymous = files[getRandomInt(0, files.length - 1)]

    res.sendFile(__dirname + "/media/anonymous/" + randomAnonymous)
})

// api

app.post("/api/upload", APP_LIMITS, async function(request, response) {
    let isShareX = request.headers["user-agent"].indexOf("ShareX") != -1
    let uploadKey = request.body["key"]

    console.log("is ShareX", isShareX)

    if (!request.files || Object.keys(request.files).length === 0) {
        return response.status(400).send({
            status: "failed",
            message: "No files uploaded"
        })
    }

    if (!isUploadKeyValid(uploadKey)) return response.status(401).json({
        status: "failed",
        message: "Incorrect upload key"
    })

    let uploadedFile = request.files.mediaFile
    let type = uploadedFile.name.split(".")[1]
    let generatedName = await generateName(type)

    uploadedFile.mv(`${__dirname}/media/${generatedName}.${type}`, (err) => {
        if (err) {
            console.error(err)
            response.status(500).json({
                status: "failed",
                message: "Internal Server Error",
                error: err
            })
        } else {
            if (isShareX) {
                response.send(`https://i.diltzy.xyz/${generatedName}.${type}`)
            } else {
                response.redirect(`../${generatedName}.${type}`)
            }
        }
    })

    /*           return response.status(500).json({
            status: "failed",
            message: "Internal Server Error",
            error: err
          }) */

    
})

app.post("/api/generateKey", async function(request, response) {
    if (request.body.password == envConfig.GENERATOR_PASSWORD) {
        let uploadKey = crypto.randomUUID().toString()
        currentUploadKeys[uploadKey] = true

        setTimeout(() => {
            delete currentUploadKeys[uploadKey]
        }, 5 * 60 * 1000);

        return response.status(200).json({
            status: "success",
            key: uploadKey
        })
    }
    
    response.status(403).json({
        status: "failed",
        message: "Incorrect password"
    })
}, APP_LIMITS)

// listen

app.listen(envConfig.PORT, () => {
    console.log(`Port: ${envConfig.PORT}; ${envConfig.MESSAGE}`)
})

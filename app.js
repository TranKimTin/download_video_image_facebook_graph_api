const axios = require("axios");
const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
let listToken = [];

async function main() {
    listToken = fs.readFileSync('token.txt').toString().trim();
    let listId = fs.readFileSync('id.txt').toString().trim();
    listId = listId.split('\n').map(item => item.trim()).filter(item => item);
    listToken = listToken.split('\n').map(item => item.trim()).filter(item => item);

    let choose = 0;
    while (isNaN(choose) || choose <= 0 || choose > 4) {
        console.log(`1: Download image post + tag`);
        console.log(`2: Download image post + tag + share`);
        console.log(`3: Download videos post`);
        console.log(`4: Download videos post + tag + share`);
        choose = await input("choose: ");
        choose *= 1;
    }

    let result = await Promise.allSettled(listId.map(id => task(id, choose)));
    console.log('FINISH ALL');
    for (let res of result)
        console.log(res.value);


    //rl.close();
}

main();

async function task(id, choose) {
    let success = 0, fail = 0;
    let data = [], paging = {};
    try {
        let { type, name } = await getTypeOfId(id);
        console.log(`${type} ${name}`)
        let node;
        if (choose == 1 || choose == 2) node = await getPhotos(id, type);
        if (choose == 3 || choose == 4) node = await getVideos(id, type);
        data = node.data || [];
        paging = node.paging || {};
        while (paging && paging.next) {
            for (let item of data) {
                try {
                    if (choose == 1 || choose == 2) {
                        if (!item.attachments) continue;
                        if (type == 'user' && !item.link) continue;
                        if (type == 'user' && (!item.link.includes(id) && !item.link.includes('https://www.facebook.com/photo.php'))) continue;
                        for (let attach of item.attachments.data) {
                            if (!attach.media_type) continue;
                            if (attach.media_type != 'photo' && attach.media_type != 'album') continue;
                            if (attach.media_type == 'photo') {
                                await downloadImage(attach.media.image.src, attach.target.id, id, name);
                                success++;
                                console.log(`${id}\t\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`);
                            }
                            if (attach.media_type == 'album') {
                                if (!attach.subattachments) continue;
                                for (let subAttach of attach.subattachments.data) {
                                    await downloadImage(subAttach.media.image.src, subAttach.target.id, id, name);
                                    success++;
                                    console.log(`${id}\t\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`);
                                }
                            }
                        }
                    }
                    if (choose == 3 || choose == 4) {
                        if (item.type && item.type != 'video') continue;
                        if (choose == 3 && type == 'user' && !item.link) continue;
                        if (choose == 3 && type == 'user' && !item.link.includes(id)) continue;
                        if (!item.source && !item.object_id) continue;
                        if (!item.source) item.source = await getSource(item.object_id);
                        // console.log(item.source);
                        await downloadVideo(item.source, item.object_id, id, name);
                        success++;
                        console.log(`${id}\t\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`);
                    }
                }
                catch (err) {
                    if (err.response) console.log('download error', err.response.data);
                    else console.log('download error', err.toString())
                    fail++;
                    console.log(`${id}\t\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`);
                }
            }
            console.log('next: ', paging.next)
            data = [];
            try {
                node = await getNext(paging.next);
                data = node.data || [];
                paging = node.paging || {};
            }
            catch (err) {
                if (err.response) console.log('get next error', err.response.data);
                else console.log('get next error', err.toString())
            }
        }

        console.log(`${id} FINISH`);
        console.log(`${id}\t\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`);
    } catch (err) {
        if (err.response) console.log(`Get ${(choose == 1 || choose == 2) ? 'image' : 'videos'} error`, err.response.data);
        else console.log(`get ${(choose == 1 || choose == 2) ? 'image' : 'videos'} error`, err.toString());
    }
    return `${id}\tSUCCESS: ${success}\tFAIL: ${fail}\t\t${name}`;
}

async function getTypeOfId(id) {
    let token = randomToken()
    let res = await axios.get(`https://graph.facebook.com/v10.0/${id}?metadata=1&access_token=${token}`).then(data => data.data);
    return { type: res.metadata.type.toLowerCase().trim(), name: res.name.toLowerCase().trim() };
}

async function getPhotos(uid, type) {
    let token = randomToken();
    let limit = 250;
    if (type == 'page') limit = 100;
    let url;
    if (type == 'user') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=link,attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}&since=2015-01-01`;
    if (type == 'group') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}&since=2015-01-01`;
    if (type == 'page') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}&since=2015-01-01`;
    return await axios.get(url).then(res => res.data);
}

async function getVideos(id, type) {
    let token = randomToken();
    let limit = 250;
    let url;
    if (type == 'user') url = `https://graph.facebook.com/v10.0/${id}/feed?fields=type,link,object_id&limit=${limit}&access_token=${token}&since=2015-01-01`;
    if (type == 'group') url = `https://graph.facebook.com/v10.0/${id}/feed?fields=type,object_id&limit=${limit}&access_token=${token}&since=2015-01-01`;
    if (type == 'page') url = `https://graph.facebook.com/v10.0/${id}/videos?fields=source&limit=${limit}&access_token=${token}&since=2015-01-01`;

    return await axios.get(url).then(res => res.data);
}

async function getNext(url) {
    let token = randomToken();
    url = url.replace(/(access_token=).*?(&)/,'$1' + token + '$2');
    return await axios.get(url).then(res => res.data);
}

async function getSource(id) {
    let token = randomToken();
    let url = `https://graph.facebook.com/v10.0/${id}/?fields=source&access_token=${token}`;
    return await axios.get(url).then(res => res.data).then(data => data.source);
}

async function downloadVideo(url, filename, id, name) {
    if (!fs.existsSync(`${id}_${name}`)) fs.mkdirSync(`${id}_${name}`);
    if (!fs.existsSync(`./${id}_${name}/videos`)) fs.mkdirSync(`./${id}_${name}/videos`);
    const writer = fs.createWriteStream(`./${id}_${name}/videos/${filename}.mp4`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve());
        writer.on('error', reject());
    });
}
async function downloadImage(url, filename, id, name) {
    if (!fs.existsSync(`${id}_${name}`)) fs.mkdirSync(`${id}_${name}`);
    if (!fs.existsSync(`./${id}_${name}/image`)) fs.mkdirSync(`./${id}_${name}/image`);
    const writer = fs.createWriteStream(`./${id}_${name}/image/${filename}.jpg`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve());
        writer.on('error', reject());
    })
}
function input(str) {
    return new Promise((resolve, reject) => {
        rl.question(str, (answer) => {
            resolve(answer);
        });
    });
}

function randomToken(){
    let rd = Math.floor(Math.random() * 10000) % listToken.length;
    return listToken[rd];
}

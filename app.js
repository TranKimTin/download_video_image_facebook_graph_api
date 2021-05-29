const axios = require("axios");
const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


let success = 0, fail = 0;
async function main() {
    try {
        const token = fs.readFileSync('token.txt').toString().trim();
        const id = fs.readFileSync('id.txt').toString().trim();

        let choose = 0;
        while (isNaN(choose) || choose <= 0 || choose > 4) {
            console.log(`1: Tai anh ${id} dang + tag`);
            console.log(`2: Tai anh ${id} dang + tag + share`);
            console.log(`3: Tai video ${id} dang`);
            console.log(`4: Tai video ${id} dang + share`);
            choose = await input("Nhap lua chon: ");
            choose *= 1;
        }

        let type = await getTypeOfId(id, token);
        console.log(type)
        let node;
        if (choose == 1 || choose == 2) node = await getPhotos(id, token, type);
        if (choose == 3 || choose == 4) node = await getVideos(id, token, type);
        let { data = [], paging = {} } = node;
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
                                await downloadImage(attach.media.image.src, attach.target.id);
                                success++;
                                console.log(`SUCCESS: ${success}\tFAIL: ${fail}`);
                            }
                            if (attach.media_type == 'album') {
                                if (!attach.subattachments) continue;
                                for (let subAttach of attach.subattachments.data) {
                                    await downloadImage(subAttach.media.image.src, subAttach.target.id);
                                    success++;
                                    console.log(`SUCCESS: ${success}\tFAIL: ${fail}`);
                                }
                            }
                        }
                        //await downloadImage(item.full_picture, item.id);
                    }
                    if (choose == 3 || choose == 4) {
                        if (item.type && item.type != 'video') continue;
                        if (choose == 3 && type == 'user' && !item.link) continue;
                        if (choose == 3 && type == 'user' && !item.link.includes(id)) continue;
                        if (!item.source && !item.object_id) continue;
                        if (!item.source) item.source = await getSource(item.object_id, token);
                        console.log(item.source);
                        await downloadVideo(item.source, item.object_id);
                        success++;
                        console.log(`SUCCESS: ${success}\tFAIL: ${fail}`);
                    }
                }
                catch (err) {
                    if (err.response) console.log('download error', err.response.data);
                    else console.log('download error', err.toString())
                    fail++;
                    console.log(`SUCCESS: ${success}\tFAIL: ${fail}`);
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

        console.log("FINISH");
        console.log(`SUCCESS: ${success}\tFAIL: ${fail}`);
        rl.close();
    } catch (err) {
        if (err.response) console.log('get videos/image error', err.response.data);
        else console.log('get videos/image error', err.toString());
        rl.close();
    }

}

main();

async function getTypeOfId(id, token) {
    let res = await axios.get(`https://graph.facebook.com/v10.0/${id}?metadata=1&access_token=${token}`).then(data => data.data);
    console.log(`FB: ${res.name}`);
    return res.metadata.type.toLowerCase().trim();
}

async function getPhotos(uid, token, type) {
    let limit = 250;
    if (type == 'page') limit = 100;
    let url;
    if (type == 'user') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=link,attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}`;
    if (type == 'group') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}`;
    if (type == 'page') url = `https://graph.facebook.com/v10.0/${uid}/feed/?fields=attachments.limit(100){type,media_type,media,target,subattachments}&limit=${limit}&access_token=${token}`;
    return await axios.get(url).then(res => res.data);
}

async function getVideos(id, token, type) {
    let limit = 250;
    let url;
    if (type == 'user') url = `https://graph.facebook.com/v10.0/${id}/feed?fields=type,link,object_id&limit=${limit}&access_token=${token}`;
    if (type == 'group') url = `https://graph.facebook.com/v10.0/${id}/feed?fields=type,object_id&limit=${limit}&access_token=${token}`;
    if (type == 'page') url = `https://graph.facebook.com/v10.0/${id}/videos?fields=source&limit=${limit}&access_token=${token}`;

    return await axios.get(url).then(res => res.data);
}

async function getNext(url) {
    return await axios.get(url).then(res => res.data);
}

async function getSource(id, token) {
    let url = `https://graph.facebook.com/v10.0/${id}/?fields=source&access_token=${token}`;
    return await axios.get(url).then(res => res.data).then(data => data.source);
}

async function downloadVideo(url, filename) {
    if (!fs.existsSync('videos')) {
        fs.mkdirSync('videos');
    }

    const writer = fs.createWriteStream(`./videos/${filename}.mp4`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve())
        writer.on('error', reject())
    });
}
async function downloadImage(url, filename) {
    if (!fs.existsSync('image')) {
        fs.mkdirSync('image');
    }

    const writer = fs.createWriteStream(`./image/${filename}.jpg`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve())
        writer.on('error', reject())
    })
}
function input(str) {
    return new Promise((resolve, reject) => {
        rl.question(str, (answer) => {
            resolve(answer);
        });
    });
}

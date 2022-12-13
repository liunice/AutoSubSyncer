import { Core } from './Core.js'
import fetch from 'isomorphic-fetch'

!(async () => {
    const syncer = new Core(async (platform, url) => {
        switch (platform.toLowerCase()) {
            case 'hbomax':
                return await getVTT_hbomax(syncer, url)
            case 'peacock':
                return await getVTT_peacock(syncer, url)
            case 'britbox':
                return await getVTT_britbox(syncer, url)
            case 'lionsgate+':
            case 'starz':
                return await getVTT_starz(syncer, url)
            case 'hulu':
                return await getVTT_hulu(syncer, url)
            case 'paramount+':
                return await getVTT_paramount(syncer, url)
            default:
                return null
        }
    })
    await syncer.match()

    // url = https://manifests.api.hbo.com/hls.m3u8?f.audioTrack=en-US%7Cprogram&f.initialBitrate=700&r.duration=3823.653076&r.hdcpPolicy=standard&r.host=https%3A%2F%2Fcmaf.cf.us.hbomaxcdn.com&r.keymod=1&r.main=0&r.manifest=videos%2FGYICZIwanuJSmpAEAAAFC%2F5%2Fc0f457%2F5.m3u8&r.origin=cmaf
    async function getVTT_hbomax(syncer, url) {
        let main_manifest_idx = 0
        const mUrl = /&r\.main=(\d+)/.exec(url)
        if (mUrl) {
            main_manifest_idx = parseInt(mUrl[1])
        }
        const durations = [...url.matchAll(/&r\.duration=([\d\.]+)/g)]
        const main_duration = parseFloat(durations[main_manifest_idx][1])

        // get vtt list url
        const hlsBody = await getBody(url)
        // #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="vtt",NAME="en-US SDH",...,URI="
        const mHls = /#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="vtt",NAME=".*?en-US.*?".*?,URI="([^"]+)"/i.exec(hlsBody)
        if (!mHls) {
            console.log('vtt字幕列表url获取失败...')
            return null
        }
        // https://manifests.api.hbo.com/hlsMedia.m3u8?r.host=https%3A%2F%2Fcmaf.cf.us.hbomaxcdn.com&r.manifest=videos%2FGYICZIwanuJSmpAEAAAFC%2F5%2Fc0f457%2Ft0.m3u8&r.origin=cmaf
        const vttListUrl = mHls[1]
        console.log(vttListUrl)

        const body = await getBody(vttListUrl)
        let content = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:9000

`
        let matches = [...body.matchAll(/#EXTINF:([\d\.]+),\s+(http.+)/g)]
        if (durations.length > 1) {
            // 多个manifest的只下载一个vtt文件
            matches = matches.slice(main_manifest_idx, main_manifest_idx + 1)
        }
        let vtt_duration = 0
        const vtt_urls = []
        for (let i = 0; i < matches.length; i++) {
            vtt_duration += parseFloat(matches[i][1])
            vtt_urls.push(matches[i][2])
        }
        if (Math.abs(vtt_duration - main_duration) >= 300) {
            // 差距超过300秒认为不正常
            console.log(`异常！合并后的vtt时长为 ${vtt_duration}秒，远小于url中的时长 ${main_duration}秒`)
            return null
        }

        try {
            content += await syncer.download_vtts(vtt_urls)
            console.log('Success! All vtt files downloaded.')
        }
        catch (e) {
            console.log('!!! vtt files download failed:', e)
            return null
        }

        return content
    }

    // url = https://g001-vod-us-cmaf-prd-mc.cdn.peacocktv.com/pub/global/VcW/kD4/PCK_1619598362866.3416_01/cmaf/mpeg_cbcs/master_cmaf.m3u8?c3.ri=5002998637985040003
    async function getVTT_peacock(syncer, url) {
        // get vtt list url
        const hlsBody = await getBody(url)
        // #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="english",AUTOSELECT=YES,FORCED=NO,LANGUAGE="en",URI="_780898880.subtitles.0.m3u8"
        const mHls = /#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="english".*?,URI="([^"]+)"/i.exec(hlsBody)
        if (!mHls) {
            console.log('vtt字幕列表url获取失败...')
            return null
        }
        // https://g001-vod-us-cmaf-prd-mc.cdn.peacocktv.com/pub/global/VcW/kD4/PCK_1619598362866.3416_01/cmaf/mpeg_cbcs/_778678926.subtitles.0.m3u8
        let vttListUrl = mHls[1]
        if (!vttListUrl.startsWith('http')) {
            // _778678926.subtitles.0.m3u8
            vttListUrl = getPath(url) + vttListUrl
        }
        console.log(vttListUrl)

        const body = await getBody(vttListUrl)
        let content = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:9000

`
        const vtt_urls = [...body.matchAll(/#EXTINF:([\d\.]+),\s+(.+)/g)].map(m => {
            if (!m[2].startsWith('http')) {
                return getPath(url) + m[2]
            }
            return m[2]
        })
        try {
            content += await syncer.download_vtts(vtt_urls)
            console.log('Success! All vtt files downloaded.')
        }
        catch (e) {
            console.log('!!! vtt files download failed:', e)
            return null
        }

        return content
    }

    // url = https://ctv.blue.content.britbox.co.uk/2-7438-0001-001/32/8_15_0/VAR084/2-7438-0001-001_32_8_VAR084.ism/.m3u8?hdnea=st%3D1670559312~exp%3D1670580912~acl%3D/2-7438-0001-001/%2A~data%3Dnohubplus~hmac%3Dc3c589d76a6b63f668dd5207beae2e4a26cc8d016624bcaba451b305ce777122
    async function getVTT_britbox(syncer, url) {
        // get vtt list url
        const hlsBody = await getBody(url)
        // #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="textstream",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="
        const mHls = /#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="textstream",LANGUAGE="en".*?,URI="([^"]+)"/i.exec(hlsBody)
        if (!mHls) {
            console.log('vtt字幕列表url获取失败...')
            return null
        }
        // https://ctv.blue.content.britbox.co.uk/2-7438-0001-001/32/8_15_0/VAR084/2-7438-0001-001_32_8_VAR084.ism/hdntl=exp=1670646093~acl=%2f2-7438-0001-001%2f*~data=hdntl~hmac=02eea75f0b9dfed0ae08b679dc443e36d2bb3d2020dbc944810dce7ba5c684fd/2-7438-0001-001_32_8_VAR084-textstream_eng=1000.m3u8
        let vttListUrl = mHls[1]
        if (!vttListUrl.startsWith('http')) {
            // hdntl=exp=1670640179~acl=%2f2-7438-0003-001%2f*~data=hdntl~hmac=ae2315aadd4c200caae627784a00df1ecf1c752dba000372731276ea595e6835/2-7438-0003-001_30_8_VAR041-textstream_eng=1000.m3u8
            vttListUrl = getPath(url) + vttListUrl
        }
        console.log(vttListUrl)

        const body = await getBody(vttListUrl)
        let content = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:9000

`
        const vtt_urls = [...body.matchAll(/#EXTINF:([\d\.]+).*?\n(.+)/g)].map(m => {
            if (!m[2].startsWith('http')) {
                return getPath(vttListUrl) + m[2]
            }
            return m[2]
        })
        if (!vtt_urls.length) {
            console.log('!!! vtt list file download failed')
            return null
        }
        try {
            content += await syncer.download_vtts(vtt_urls)
            console.log('Success! All vtt files downloaded.')
        }
        catch (e) {
            console.log('!!! vtt files download failed:', e)
            return null
        }

        return content
    }

    // url = https://mecdn2.starz.com/assets/35424/20221006091410572/Apple/captions/Captions_en-US.vtt
    async function getVTT_starz(syncer, url) {
        const content = await getBody(url)
        return content
    }

    // url = https://manifest-dp.hulustream.com/webvtt?asset_id=61202400&break_dur=30037_30030_15040_1000_30037_29988_30058_30037_30030_30058_30102_15083_30058_15040_15040_15040_15018_30030_15015&caption_language=en&audio_language=en&break_pos=749120_749120_749120_749120_1367880_1367880_1367880_1725640_1725640_1725640_2098040_2098040_2098040_2098040_2496120_2496120_2496120_2496120_2496120&region=US
    async function getVTT_hulu(syncer, url) {
        // to SKIP `SSL routines:final_renegotiate:unsafe legacy renegotiation disabled` error, use HTTP
        const body = await getBody(url.replace('https://', 'http://'))
        let content = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:9000

`
        const vtt_urls = [...body.matchAll(/#EXTINF:\d+\s+(http:\/\/assets\.huluim\.com\/captions_webvtt\/(?!blank).*?\.vtt)/g)].map(m => m[1])
        try {
            content += await syncer.download_vtts(vtt_urls)
            console.log('Success! All vtt files downloaded.')
        }
        catch (e) {
            console.log('!!! vtt files download failed:', e)
            return null
        }

        return content
    }

    // url = https://vod-gcs-cedexis.cbsaavideo.com/intl_vms/2017/09/23/1053238851585/dubs/1664335_fp_precon_hls/master.m3u8
    async function getVTT_paramount(syncer, url) {
        // get vtt list url
        const hlsBody = await getBody(url)
        // #EXT-X-MEDIA:TYPE=SUBTITLES,URI="CBS_SEAL_TEAM_101_CAPTION_1654210299/stream_vtt.m3u8",GROUP-ID="cbsi_webvtt",LANGUAGE="enG-US",NAME="enG-US",AUTOSELECT=YES
        // #EXT-X-MEDIA:TYPE=SUBTITLES,URI="4b4omhnDFfdcIrrrf4pIaH87_q4h6BYT_1609130701817/stream_vtt.m3u8",GROUP-ID="cbsi_webvtt",LANGUAGE="en",NAME="English",AUTOSELECT=YES
        const mHls = /#EXT-X-MEDIA:TYPE=SUBTITLES,URI="([^"]+)".*?,LANGUAGE="(en|enG-US)".*?/i.exec(hlsBody)
        if (!mHls) {
            console.log('vtt字幕列表url获取失败...')
            return null
        }
        // https://vod-gcs-cedexis.cbsaavideo.com/intl_vms/2017/09/23/1053238851585/dubs/1664335_fp_precon_hls/CBS_SEAL_TEAM_101_CAPTION_1654210299/stream_vtt.m3u8
        let vttListUrl = mHls[1]
        if (!vttListUrl.startsWith('http')) {
            // CBS_SEAL_TEAM_101_CAPTION_1654210299/stream_vtt.m3u8
            vttListUrl = getPath(url) + vttListUrl
        }
        console.log(vttListUrl)

        const body = await getBody(vttListUrl)
        let content = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:9000

`
        const vtt_urls = [...body.matchAll(/#EXTINF:([\d\.]+).*?\n(.+)/g)].map(m => {
            if (!m[2].startsWith('http')) {
                return getPath(vttListUrl) + m[2]
            }
            return m[2]
        })
        if (!vtt_urls.length) {
            console.log('!!! vtt list file download failed')
            return null
        }
        try {
            content += await syncer.download_vtts(vtt_urls)
            console.log('Success! All vtt files downloaded.')
        }
        catch (e) {
            console.log('!!! vtt files download failed:', e)
            return null
        }

        return content
    }

    function getPath(url) {
        const theUrl = new URL(url)
        const parts = theUrl.pathname.split('/')
        parts.pop()
        return theUrl.origin + parts.join('/') + '/'
    }

    function getBody(url) {
        return fetch(url).then(resp => resp.text())
    }
})()
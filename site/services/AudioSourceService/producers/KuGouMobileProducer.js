const { retry } = require("../utils");

const KuGouMobile = require("../../../libraries/audioSource/KuGouMobile")();

module.exports = ({ Artist, Track, List, Source, Producer, config }) => class KuGouMobileProducer extends Producer {
    static get sources() {
        return KuGouMobileProducer._sources;
    }

    static get instances() {
        return KuGouMobileProducer._instances;
    }

    static _sources = [Source.kugou];
    static _instances = config.producers.kuGouMobile.instances.map((instance) => new Producer.Instance(instance.host, instance.port, instance.protocol));

    _kuGouMobile;

    constructor(host, port, protocol) {
        super(host, port, protocol);
        this._kuGouMobile = new KuGouMobile(host, port, protocol);
    }

    async getRecommends(track, source, { playbackQuality = 0, abortSignal } = {}) {
        if (!track) {
            const tracks = await (async () => {
                const lists = await this.getLists(source, { abortSignal });
                const randomList = lists[Math.floor(lists.length * Math.random())];

                if (randomList) {
                    return (await this.getList(randomList.id, source, { playbackQuality, abortSignal }));
                }

                return null;
            })();

            if (!tracks || !tracks.length) {
                return await super.getRecommends(track, source, { playbackQuality, abortSignal });
            }

            return tracks;
        }

        return await super.getRecommends(track, source, { playbackQuality, abortSignal });
    }

    async getLists(source, { abortSignal } = {}) {
        try {
            return await retry(async () => {
                try {
                    return (await this._kuGouMobile.getRankList({
                        proxy: this._proxyPool.getRandomProxy("CN"),
                        abortSignal,
                    })).map(({ rankid, rankname }) => new List(rankid, rankname, source));
                } catch (e) {
                    console.log(e);

                    throw e;
                }
            }, this._proxyPool.getRandomProxy("CN") ? Producer.PROXY_RETRY_TIMES + 1 : 1);
        } catch (e) {
            console.log(e);

            try {
                return (await this._kuGouMobile.getRankList({ abortSignal })).map(({ rankid, rankname }) => new List(rankid, rankname, source));
            } catch (e) {
                console.log(e);

                throw e;
            }
        }
    }

    async getList(id, source, { playbackQuality = 0, limit, offset, abortSignal } = {}) {
        const tracks = await (async () => {
            try {
                return await retry(async () => {
                    try {
                        return (await this._kuGouMobile.getRankInfo(id, {
                            page: Math.ceil(offset / limit),
                            proxy: this._proxyPool.getRandomProxy("CN"),
                            abortSignal,
                        })) || null;
                    } catch (e) {
                        console.log(e);

                        throw e;
                    }
                }, this._proxyPool.getRandomProxy("CN") ? Producer.PROXY_RETRY_TIMES + 1 : 1);
            } catch (e) {
                console.log(e);

                try {
                    return (await this._kuGouMobile.getRankInfo(id, {
                        page: Math.ceil(offset / limit),
                        abortSignal,
                    })) || null;
                } catch (e) {
                    console.log(e);

                    throw e;
                }
            }
        })();

        if (tracks) {
            return tracks.map((track) => new Track(track.hash, track.filename.split("-")[track.filename.split("-").length - 1].trim(), +track.duration * 1000, track.filename.split("-")[0].trim().split(/(?:、|,)/).map((singerName) => new Artist(singerName.trim())), undefined, source));
        }

        return null;
    }
};

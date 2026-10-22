import type { YakuId } from '../analysis/yaku.ts';

const yakuNames: Record<YakuId, string> = {
  rinshan: '嶺上開花', chankan: '槍槓', sankantsu: '三槓子', suukantsu: '四槓子',
  haitei: '海底摸月', houtei: '河底撈魚',
  riichi: '立直', ippatsu: '一発', 'double-riichi': 'ダブル立直', 'menzen-tsumo': '門前清自摸和', tanyao: '断么九',
  'yakuhai-white': '役牌：白', 'yakuhai-green': '役牌：發', 'yakuhai-red': '役牌：中',
  'yakuhai-seat-wind': '役牌：自風', 'yakuhai-round-wind': '役牌：場風',
  pinfu: '平和', iipeikou: '一盃口', ryanpeikou: '二盃口', sanankou: '三暗刻',
  chiitoitsu: '七対子', toitoi: '対々和', shousangen: '小三元', honroutou: '混老頭',
  chanta: '混全帯么九', junchan: '純全帯么九', 'sanshoku-doukou': '三色同刻',
  'sanshoku-doujun': '三色同順', ittsu: '一気通貫', honitsu: '混一色', chinitsu: '清一色',
  'kokushi-musou': '国士無双', suuankou: '四暗刻', daisangen: '大三元', tsuuiisou: '字一色',
  ryuuiisou: '緑一色', chinroutou: '清老頭', shousuushii: '小四喜', daisuushii: '大四喜',
  'chuuren-poutou': '九蓮宝燈', tenhou: '天和', chiihou: '地和',
};

export function yakuDisplayName(id: YakuId): string {
  return yakuNames[id];
}

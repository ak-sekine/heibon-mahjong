"""Expected score-tier labels for Browser UI result-summary checks."""

def score_summary_label(score_tier, yakuman_count, han, fu):
    if yakuman_count > 0:
        return {1: '役満', 2: 'ダブル役満', 3: 'トリプル役満', 4: '4倍役満'}.get(
            yakuman_count, f'{yakuman_count}倍役満')
    if score_tier == 'kazoe-yakuman':
        return '数え役満'
    if score_tier == 'normal':
        return f'{han}翻' + (f' {fu}符' if fu is not None else '')
    return f'{han}翻 ' + {
        'mangan': '満貫', 'haneman': '跳満', 'baiman': '倍満', 'sanbaiman': '三倍満',
        'yakuman': '役満',
    }[score_tier]

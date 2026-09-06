import { defaultBoard } from './board.js';

/**
 * 내장 프리셋. 사용자 프리셋은 data/presets/*.json 에 저장된다.
 * 프리셋 = { name, description, settings?: 부분 설정, tiles: 보드 }
 */
export function builtinPresets() {
  return {
    default24: {
      name: '기본 24칸',
      description: '표준 주루마블. 원샷/지목/미션/황금열쇠/무인도',
      settings: { gameType: 'marble', diceCount: 2, diceSides: 6 },
      tiles: defaultBoard(),
    },

    roulette12: {
      name: '룰렛 12칸',
      description: '위치 없이 매번 추첨. weight 로 확률 조절 (합계 기준 %)',
      settings: { gameType: 'roulette', doubleRule: 'none', propertyMode: 'off' },
      tiles: tag([
        { name: '꽝 (통과)', type: 'START', weight: 3, color: '#4a4a6a' },
        { name: '원샷', type: 'DRINK', drink: 1, target: 'self', weight: 4 },
        { name: '지목샷', type: 'DRINK', drink: 1, target: 'pick', weight: 3 },
        { name: '전원 건배', type: 'DRINK', drink: 1, target: 'all', weight: 1 },
        { name: '황금열쇠', type: 'GOLDEN_KEY', weight: 2 },
        { name: '369 게임', type: 'MISSION', drink: 1, description: '369, 걸리면 한 잔', weight: 2 },
        { name: '노래 한 소절', type: 'MISSION', drink: 1, description: '거부 시 한 잔', weight: 2 },
        { name: '면제권', type: 'SAFE', weight: 1 },
        { name: '한 턴 쉬기', type: 'JAIL', skip: 1, weight: 1 },
        { name: '폭탄주', type: 'DRINK', drink: 2, target: 'self', weight: 1 },
        { name: '왼쪽 원샷', type: 'DRINK', drink: 1, target: 'left', weight: 2 },
        { name: '오른쪽 원샷', type: 'DRINK', drink: 1, target: 'right', weight: 2 },
      ]),
    },

    party32: {
      name: '파티 32칸 (땅 소유)',
      description: '부루마블식. 벌칙 칸에 처음 도착하면 내 땅, 남의 땅은 통행세 2배',
      settings: { gameType: 'marble', diceCount: 2, diceSides: 6, propertyMode: 'on', doubleRule: 'triple_jail' },
      tiles: tag([
        { name: '출발', type: 'START' },
        { name: '맥주 한 잔', type: 'DRINK', drink: 1, color: '#f5b431' },
        { name: '소주 한 잔', type: 'DRINK', drink: 1, color: '#7ed957' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '지목샷', type: 'DRINK', drink: 1, target: 'pick' },
        { name: '369', type: 'MISSION', drink: 1 },
        { name: '러브샷', type: 'DRINK', drink: 1, target: 'pick' },
        { name: '무인도', type: 'JAIL', skip: 1, drink: 1 },
        { name: '소맥', type: 'DRINK', drink: 1 },
        { name: '왼쪽 원샷', type: 'DRINK', drink: 1, target: 'left' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '눈치게임', type: 'MISSION', drink: 1 },
        { name: '하이볼', type: 'DRINK', drink: 1 },
        { name: '전원 건배', type: 'DRINK', drink: 1, target: 'all' },
        { name: '뒤로 4칸', type: 'MOVE', steps: -4 },
        { name: '흑기사', type: 'MISSION', drink: 1, description: '대신 마실 사람 지목, 없으면 2잔' },
        { name: '술배 (안전)', type: 'SAFE' },
        { name: '와인 한 잔', type: 'DRINK', drink: 1, color: '#b0326b' },
        { name: '오른쪽 원샷', type: 'DRINK', drink: 1, target: 'right' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '진실게임', type: 'MISSION', drink: 1 },
        { name: '폭탄주', type: 'DRINK', drink: 2 },
        { name: '애교 3종', type: 'MISSION', drink: 1 },
        { name: '앞으로 3칸', type: 'MOVE', steps: 3 },
        { name: '막걸리', type: 'DRINK', drink: 1, color: '#e8e0c8' },
        { name: '양옆 원샷', type: 'DRINK', drink: 1, target: 'sides' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '3초 안에 3개', type: 'MISSION', drink: 1 },
        { name: '무인도 직행', type: 'MOVE', goto: 7 },
        { name: '데킬라', type: 'DRINK', drink: 1, color: '#d7c25a' },
        { name: '출발점으로', type: 'MOVE', goto: 0 },
        { name: '마지막 2잔', type: 'DRINK', drink: 2 },
      ]),
    },

    softMission: {
      name: '무알콜 미션 20칸',
      description: '술 없이 미션만. 잔 수는 "벌칙 포인트"로 읽으면 됨',
      settings: { gameType: 'marble', diceCount: 2, diceSides: 6, penaltyMode: 'queue' },
      tiles: tag([
        { name: '출발', type: 'START' },
        { name: '성대모사', type: 'MISSION', drink: 1, description: '아무나 성대모사 10초' },
        { name: '댄스 타임', type: 'MISSION', drink: 1, description: '채팅이 고른 노래로 15초' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '초성 퀴즈', type: 'MISSION', drink: 1, description: '채팅 출제, 30초 안에' },
        { name: '몸으로 말해요', type: 'MISSION', drink: 1 },
        { name: '한 턴 쉬기', type: 'JAIL', skip: 1 },
        { name: '칭찬 릴레이', type: 'MISSION', drink: 1, description: '왼쪽 사람 칭찬 3개' },
        { name: '즉석 랩', type: 'MISSION', drink: 1, description: '주어진 단어로 4마디' },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '표정 3종', type: 'MISSION', drink: 1 },
        { name: '뒤로 2칸', type: 'MOVE', steps: -2 },
        { name: '애교 3종', type: 'MISSION', drink: 1 },
        { name: '안전', type: 'SAFE' },
        { name: 'TMI 하나', type: 'MISSION', drink: 1 },
        { name: '황금열쇠', type: 'GOLDEN_KEY' },
        { name: '1분 스탠딩 코미디', type: 'MISSION', drink: 2 },
        { name: '채팅 소원 하나', type: 'MISSION', drink: 1, description: '채팅 투표로 정한 소원 들어주기' },
        { name: '출발점으로', type: 'MOVE', goto: 0 },
        { name: '전원 미션', type: 'MISSION', drink: 1, target: 'all', description: '모두 함께 셀카 포즈' },
      ]),
    },
    ...dicePresets(),
  };
}

/**
 * 주사위 종류별 보드. 한 바퀴에 4~5번 굴리도록 칸 수를 맞췄다.
 *   1d6  → 평균 3.5  → 16칸
 *   1d12 → 평균 6.5  → 30칸
 *   1d20 → 평균 10.5 → 40칸
 *   3d6  → 평균 10.5 → 48칸 (더블 = 세 개 모두 같은 눈)
 * 프리셋의 settings 는 "추천 조합"이다. 보드만 쓰고 주사위는 따로 고르려면 boardOnly 로 적용한다.
 */
export function dicePresets() {
  return {
    quick16_1d6: {
      name: '빠른 16칸 (1d6)',
      description: '주사위 1개, 짧은 판. 더블 없음',
      settings: { gameType: 'marble', diceCount: 1, diceSides: 6, doubleRule: 'none', propertyMode: 'off' },
      tiles: tag([
        S(), D('원샷'), D('지목샷', 1, 'pick'), K(),
        M('369 게임'), D('왼쪽 원샷', 1, 'left'), J(), D('소맥'),
        K(), M('진실 게임'), SAFE(), D('전원 건배', 1, 'all'),
        MV(-3, '뒤로 3칸'), K(), D('오른쪽 원샷', 1, 'right'), D('마지막 2잔', 2),
      ]),
    },

    mid30_1d12: {
      name: '중간 30칸 (1d12)',
      description: '12면체 1개. 균등 확률이라 어느 칸이든 골고루 밟음',
      settings: { gameType: 'marble', diceCount: 1, diceSides: 12, doubleRule: 'none', propertyMode: 'off' },
      tiles: tag([
        S(), D('원샷'), M('369 게임'), K(), D('지목샷', 1, 'pick'),
        D('왼쪽 원샷', 1, 'left'), M('성대모사'), J(), D('소맥'), K(),
        M('눈치 게임'), D('러브샷', 1, 'pick'), D('폭탄주', 2), MV(-4, '뒤로 4칸'), SAFE(),
        D('전원 건배', 1, 'all'), K(), M('흑기사', 1, '대신 마실 사람 지목, 없으면 2잔'), D('오른쪽 원샷', 1, 'right'), M('진실 게임'),
        D('양옆 원샷', 1, 'sides'), K(), J('외딴섬'), D('하이볼'), M('3초 안에 3개'),
        GOTO(0, '출발점으로'), D('와인 한 잔'), K(), M('애교 3종'), D('마지막 2잔', 2),
      ]),
    },

    long40_1d20: {
      name: '긴 40칸 (1d20)',
      description: '20면체 1개. 크게 움직이니 칸이 많아야 재미있음',
      settings: { gameType: 'marble', diceCount: 1, diceSides: 20, doubleRule: 'none', propertyMode: 'off' },
      tiles: tag([
        S(), D('원샷'), M('369 게임'), D('지목샷', 1, 'pick'), K(),
        D('왼쪽 원샷', 1, 'left'), M('성대모사'), D('소맥'), MV(-5, '뒤로 5칸'), K(),
        J(), D('러브샷', 1, 'pick'), M('눈치 게임'), D('폭탄주', 2), K(),
        D('오른쪽 원샷', 1, 'right'), M('초성 퀴즈'), D('하이볼'), MV(5, '앞으로 5칸'), SAFE(),
        D('전원 건배', 1, 'all'), M('흑기사', 1, '대신 마실 사람 지목, 없으면 2잔'), D('와인 한 잔'), K(), M('진실 게임'),
        D('양옆 원샷', 1, 'sides'), J('외딴섬'), D('막걸리'), M('3초 안에 3개'), K(),
        D('지목 2샷', 2, 'pick'), M('댄스 15초'), D('데킬라'), MV(-10, '뒤로 10칸'), K(),
        D('소주 한 잔'), M('애교 3종'), GOTO(0, '출발점으로'), D('전원 건배', 1, 'all'), D('마지막 2잔', 2),
      ]),
    },

    big48_3d6: {
      name: '대형 48칸 (3d6)',
      description: '주사위 3개. 합이 10~11에 몰림. 더블(세 개 동일)이면 한 번 더',
      settings: { gameType: 'marble', diceCount: 3, diceSides: 6, doubleRule: 'extra_turn', propertyMode: 'off' },
      tiles: tag([
        S(), D('원샷'), M('369 게임'), D('지목샷', 1, 'pick'), K(), D('왼쪽 원샷', 1, 'left'),
        M('성대모사'), D('소맥'), MV(-6, '뒤로 6칸'), K(), J(), D('러브샷', 1, 'pick'),
        M('눈치 게임'), D('폭탄주', 2), K(), D('오른쪽 원샷', 1, 'right'), M('초성 퀴즈'), D('하이볼'),
        MV(6, '앞으로 6칸'), SAFE(), D('전원 건배', 1, 'all'), M('흑기사', 1, '대신 마실 사람 지목, 없으면 2잔'), D('와인 한 잔'), K(),
        M('진실 게임'), D('양옆 원샷', 1, 'sides'), J('외딴섬'), D('막걸리'), M('3초 안에 3개'), K(),
        D('지목 2샷', 2, 'pick'), M('댄스 15초'), D('데킬라'), MV(-12, '뒤로 12칸'), K(), D('소주 한 잔'),
        M('애교 3종'), D('맥주 한 잔'), SAFE('두 번째 술배'), M('TMI 하나'), K(), D('전원 건배', 1, 'all'),
        J('무인도 2'), D('소맥 제조'), M('즉석 랩'), GOTO(0, '출발점으로'), K(), D('마지막 2잔', 2),
      ]),
    },
  };
}

// ---- 타일 축약 헬퍼
const S = () => ({ name: '출발', type: 'START', description: '한 바퀴마다 면제권 1개' });
const D = (name, drink = 1, target = 'self') => ({ name, type: 'DRINK', drink, target });
const M = (name, drink = 1, description) => ({ name, type: 'MISSION', drink, ...(description ? { description } : {}) });
const K = () => ({ name: '황금열쇠', type: 'GOLDEN_KEY' });
const J = (name = '무인도') => ({ name, type: 'JAIL', skip: 1, drink: 1, description: '한 잔 마시고 한 턴 쉬기' });
const SAFE = (name = '술배 (안전)') => ({ name, type: 'SAFE', description: '면제권 1개' });
const MV = (steps, name) => ({ name, type: 'MOVE', steps });
const GOTO = (index, name) => ({ name, type: 'MOVE', goto: index });

function tag(tiles) {
  return tiles.map((t, id) => ({ id, ...t }));
}

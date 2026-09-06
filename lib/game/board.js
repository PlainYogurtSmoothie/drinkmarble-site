import { GameError } from './errors.js';

/**
 * 보드 타일 정의
 *
 * 공통 필드
 *   name         칸 이름
 *   type         아래 중 하나
 *   description  설명(오버레이/채팅 표시)
 *   weight       룰렛 모드 추첨 가중치 (기본 1)
 *   color        오버레이 테두리 색 (#hex)
 *   image        오버레이 배경 이미지 URL
 *
 * type:
 *   START      출발. 한 바퀴 돌 때마다 면제권 1개 (룰렛 모드에서는 '꽝')
 *   DRINK      마시기. drink=잔 수, target=self|pick|left|right|sides|all|team|others
 *   MISSION    미션(게임). 실패 시 drink 만큼
 *   GOLDEN_KEY 황금열쇠 카드 뽑기
 *   JAIL       무인도. skip 턴 만큼 쉬기 (+ drink)
 *   SAFE       안전 지대(술배). 면제권 1개
 *   MOVE       이동. steps(상대) 또는 goto(절대 인덱스). 룰렛 모드에서는 '통과'
 */
export const TILE_TYPES = ['START', 'DRINK', 'MISSION', 'GOLDEN_KEY', 'JAIL', 'SAFE', 'MOVE'];
export const DRINK_TARGETS = ['self', 'pick', 'left', 'right', 'sides', 'all', 'team', 'others'];
/** 땅 소유 모드에서 소유 가능한 칸 */
export const OWNABLE_TYPES = ['DRINK', 'MISSION'];

export function defaultBoard() {
  return [
    { name: '출발', type: 'START', description: '한 바퀴마다 면제권 1개 획득' },
    { name: '원샷', type: 'DRINK', drink: 1, target: 'self', description: '본인 원샷' },
    { name: '지목샷', type: 'DRINK', drink: 1, target: 'pick', description: '한 명 지목해서 원샷' },
    { name: '황금열쇠', type: 'GOLDEN_KEY', description: '카드 한 장 뽑기' },
    { name: '러브샷', type: 'DRINK', drink: 1, target: 'pick', description: '지목한 사람과 러브샷' },
    { name: '369 게임', type: 'MISSION', drink: 1, description: '369 게임, 걸린 사람 한 잔' },
    { name: '무인도', type: 'JAIL', skip: 1, drink: 1, description: '한 잔 마시고 한 턴 쉬기' },
    { name: '왼쪽 원샷', type: 'DRINK', drink: 1, target: 'left', description: '왼쪽(이전 순서) 사람 원샷' },
    { name: '폭탄주', type: 'DRINK', drink: 2, target: 'self', description: '폭탄주 제조 후 원샷 (2잔 카운트)' },
    { name: '황금열쇠', type: 'GOLDEN_KEY', description: '카드 한 장 뽑기' },
    { name: '눈치 게임', type: 'MISSION', drink: 1, description: '눈치 게임, 마지막/겹친 사람 한 잔' },
    { name: '흑기사', type: 'MISSION', drink: 1, description: '대신 마셔 줄 사람 지목. 없으면 본인 2잔' },
    { name: '술배 (안전)', type: 'SAFE', description: '통과! 면제권 1개 획득' },
    { name: '전원 건배', type: 'DRINK', drink: 1, target: 'all', description: '모두 한 잔' },
    { name: '오른쪽 원샷', type: 'DRINK', drink: 1, target: 'right', description: '오른쪽(다음 순서) 사람 원샷' },
    { name: '황금열쇠', type: 'GOLDEN_KEY', description: '카드 한 장 뽑기' },
    { name: '3초 안에 3개', type: 'MISSION', drink: 1, description: '주제 정해서 3초 안에 3개 말하기' },
    { name: '뒤로 3칸', type: 'MOVE', steps: -3, description: '뒤로 3칸 이동 후 그 칸 효과 적용' },
    { name: '소맥 제조', type: 'DRINK', drink: 1, target: 'self', description: '소맥 말아서 원샷' },
    { name: '진실 게임', type: 'MISSION', drink: 1, description: '질문 하나 답하기, 거부 시 한 잔' },
    { name: '황금열쇠', type: 'GOLDEN_KEY', description: '카드 한 장 뽑기' },
    { name: '후원자 지목', type: 'DRINK', drink: 1, target: 'pick', description: '최근 후원자가 지목하는 사람 원샷' },
    { name: '출발점으로', type: 'MOVE', goto: 0, description: '출발점으로 이동 (면제권 없음)' },
    { name: '마지막 한 잔', type: 'DRINK', drink: 2, target: 'self', description: '마무리 2잔' },
  ].map((tile, index) => ({ id: index, ...tile }));
}

export function validateBoard(tiles) {
  const bad = (msg) => new GameError(msg, 'INVALID_BOARD', 400);
  if (!Array.isArray(tiles) || tiles.length < 4) throw bad('보드는 최소 4칸 이상이어야 합니다');
  if (tiles.length > 60) throw bad('보드는 최대 60칸까지 가능합니다');
  if (tiles[0]?.type !== 'START') throw bad('0번 칸은 START 여야 합니다');
  return tiles.map((t, i) => {
    if (!t || typeof t.name !== 'string' || !t.name.trim()) throw bad(`${i}번 칸: name 이 필요합니다`);
    if (!TILE_TYPES.includes(t.type)) throw bad(`${i}번 칸: 알 수 없는 type "${t.type}"`);
    if (t.type === 'DRINK' || t.type === 'MISSION') {
      if (!DRINK_TARGETS.includes(t.target ?? 'self')) throw bad(`${i}번 칸: target 은 ${DRINK_TARGETS.join('|')}`);
      if (t.drink !== undefined && !(Number.isInteger(t.drink) && t.drink >= 0)) throw bad(`${i}번 칸: drink 오류`);
    }
    if (t.type === 'MOVE') {
      const hasSteps = Number.isInteger(t.steps);
      const hasGoto = Number.isInteger(t.goto) && t.goto >= 0 && t.goto < tiles.length;
      if (!hasSteps && !hasGoto) throw bad(`${i}번 칸: MOVE 는 steps 또는 goto 가 필요합니다`);
    }
    if (t.type === 'JAIL' && t.skip !== undefined && !(Number.isInteger(t.skip) && t.skip >= 1)) {
      throw bad(`${i}번 칸: skip 은 1 이상 정수`);
    }
    if (t.weight !== undefined && !(Number.isFinite(t.weight) && t.weight >= 0)) throw bad(`${i}번 칸: weight 는 0 이상 숫자`);
    if (t.color !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(t.color)) throw bad(`${i}번 칸: color 는 #hex`);
    if (t.image !== undefined && !/^(https?:\/\/|\/|data:image\/)/.test(String(t.image))) throw bad(`${i}번 칸: image 는 URL 이어야 합니다`);
    const { owner, ...rest } = t; // 소유 정보는 보드 정의가 아닌 게임 상태
    return { ...rest, id: i, name: t.name.trim().slice(0, 30) };
  });
}

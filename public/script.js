/*
public/script.js — исправления для надёжной реакции бота после атаки

* надёжный выбор защиты (same-suit higher, иначе минимальный козырь)
* учитываем value и RANK_VALUES как запасной вариант
* добавлены console.log для отладки (можно удалить)
* минимальная задержка ответа бота уменьшена
  */

const tg = window.Telegram?.WebApp ?? {
expand() {},
initDataUnsafe: {},
HapticFeedback: { impactOccurred() {} },
showPopup(opts) { alert((opts.title?opts.title+'\n':'') + (opts.message||'')); }
};
try { tg.expand?.(); } catch(e){}

const RANK_VALUES = { '6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const ORDERED_RANKS = ['6','7','8','9','10','J','Q','K','A'];
const SUIT_ORDER = ['♣','♦','♥','♠'];
const API = { create: '/api/create-game', join: (id) => `/api/join-game/${id}`, game: (id) => `/api/game/${id}`, move: (id) => `/api/game/${id}/move` };

const el = {
assigned: document.getElementById('assigned-id'),
seats: document.getElementById('seats'),
board: document.getElementById('game-board'),
startBtn: document.getElementById('start-game'),
createBtn: document.getElementById('create-room'),
joinBtn: document.getElementById('join-room'),
joinInput: document.getElementById('join-code-input'),
toastContainer: document.getElementById('toast-container')
};
function showToast(text, ms=1400){ const t=document.createElement('div'); t.className='toast'; t.textContent=text; el.toastContainer.appendChild(t); setTimeout(()=>t.remove(), ms); }
function setAssignedId(id){ if (!el.assigned) return; el.assigned.textContent = `ID: ${id || '—'}`; }

function rankIndex(r){ return ORDERED_RANKS.indexOf(r); }
function suitIndex(s){ return SUIT_ORDER.indexOf(s); }

function sortHand(hand, trumpSuit){
hand.sort((a,b) => {
const aIsTrump = a.suit === trumpSuit;
const bIsTrump = b.suit === trumpSuit;
if (aIsTrump !== bIsTrump) return aIsTrump ? 1 : -1;
if (!aIsTrump && !bIsTrump) {
const su = suitIndex(a.suit) - suitIndex(b.suit);
if (su !== 0) return su;
return rankIndex(a.rank) - rankIndex(b.rank);
}
return rankIndex(a.rank) - rankIndex(b.rank);
});
}

/* ---------- Local bot (fixed) ---------- */
const LOCAL = { deck: [], playerHand: [], botHand: [], table: [], trumpSuit: null, trumpCard: null, attacker: 'player', defender: 'bot', currentPlayer: 'player', phase: 'attacking', status: 'idle', roundMax: null };
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];

function buildDeck(){
const d=[]; for (const s of SUITS) for (const r of RANKS) d.push({ rank:r, suit:s, value:RANK_VALUES });
for (let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; } return d;
}

function initLocalGame(){
LOCAL.deck = buildDeck();
LOCAL.trumpCard = LOCAL.deck[LOCAL.deck.length-1]; LOCAL.trumpSuit = LOCAL.trumpCard.suit;
LOCAL.playerHand=[]; LOCAL.botHand=[];
for (let i=0;i<6;i++){ if (LOCAL.deck.length) LOCAL.playerHand.push(LOCAL.deck.pop()); if (LOCAL.deck.length) LOCAL.botHand.push(LOCAL.deck.pop()); }
LOCAL.table=[]; LOCAL.attacker='player'; LOCAL.defender='bot'; LOCAL.currentPlayer=LOCAL.attacker; LOCAL.phase='attacking'; LOCAL.status='playing'; LOCAL.roundMax=null;
sortHand(LOCAL.playerHand, LOCAL.trumpSuit); sortHand(LOCAL.botHand, LOCAL.trumpSuit);
renderAllLocal();
}

/* rendering */
function renderAllLocal(){
renderSeatsLocal();
el.board.innerHTML='';
const header=document.createElement('div');
header.innerHTML = `<h2>Игра с ботом</h2>     <div class="table-section"><div>Козырь: <strong>${LOCAL.trumpSuit || '—'}</strong></div><div class="trump-card">${LOCAL.trumpCard ? (LOCAL.trumpCard.rank + LOCAL.trumpCard.suit) : ''}</div><div style="margin-top:6px;">В колоде: ${LOCAL.deck.length}</div></div>     <div class="table-section"><div class="game-status">${getStatusLocal()}</div></div>`;
el.board.appendChild(header);
renderOpponentLocal();
if (LOCAL.table.length>0) renderTableLocal();
renderActionButtonsLocal();
renderPlayerHandLocal();
}
function renderSeatsLocal(){ if (el.seats) el.seats.innerHTML = `<div class="seat you">You</div><div class="seat">Бот</div>`; }
function renderOpponentLocal(){ const n=LOCAL.botHand.length; const sec=document.createElement('div'); sec.className='opponent-section'; sec.innerHTML=`<h3>Бот: ${n}</h3>`; const row=document.createElement('div'); row.className='opponent-cards'; for (let i=0;i<Math.min(12,n);i++){ const b=document.createElement('div'); b.className='card back'; row.appendChild(b); } if (n>12){ const more=document.createElement('div'); more.className='card back more'; more.textContent=`+${n-12}`; row.appendChild(more); } sec.appendChild(row); el.board.appendChild(sec); }
function renderTableLocal(){ const sec=document.createElement('div'); sec.className='table-section'; sec.innerHTML='<h3>На столе:</h3>'; const row=document.createElement('div'); row.className='table-cards'; LOCAL.table.forEach(pair=>{ const wrap=document.createElement('div'); wrap.className='card-pair'; wrap.appendChild(cardNode(pair.attack,false)); if (pair.defend){ const d=cardNode(pair.defend,false); d.classList.add('defended'); wrap.appendChild(d); } row.appendChild(wrap); }); sec.appendChild(row); el.board.appendChild(sec); }

function renderActionButtonsLocal(){
const actions=document.createElement('div'); actions.className='action-buttons';
const allDef = LOCAL.table.length>0 && LOCAL.table.every(p=>p.defend);
if (LOCAL.phase==='defending' && LOCAL.currentPlayer==='player'){
const take=document.createElement('button'); take.className='secondary danger'; take.textContent='Взять'; take.onclick=takeCardsLocal; actions.appendChild(take);
}
if (allDef && LOCAL.currentPlayer==='player' && LOCAL.attacker==='player'){
const b=document.createElement('button'); b.className='secondary'; b.textContent='Бито'; b.onclick=()=>{ passLocal(); }; actions.appendChild(b);
}
if (actions.children.length) el.board.appendChild(actions);
}

function renderPlayerHandLocal(){
const sec=document.createElement('div'); sec.className='hand-section'; sec.innerHTML='<h3>Ваши карты:</h3>'; const row=document.createElement('div'); row.className='player-cards';
LOCAL.playerHand.forEach((card,idx)=>{ const canAttack = LOCAL.phase==='attacking' && LOCAL.currentPlayer==='player' && LOCAL.attacker==='player'; const canDefend = LOCAL.phase==='defending' && LOCAL.currentPlayer==='player' && LOCAL.defender==='player'; const clickable = (canAttack && canAttackLocal(card)) || (canDefend && canDefendLocal(card)); const n=cardNode(card, clickable); if (card.suit === LOCAL.trumpSuit) n.classList.add('trump'); if (clickable) n.addEventListener('click', ()=>{ if (canAttack && canAttackLocal(card)) attackLocal(idx); else if (canDefend && canDefendLocal(card)) defendLocal(idx); }); row.appendChild(n); });
sec.appendChild(row); el.board.appendChild(sec);
}
function cardNode(card, clickable){ const d=document.createElement('div'); d.className='card' + (clickable? ' clickable':''); const suitClass=(card.suit==='♥'||card.suit==='♦')? 'suit red':'suit black'; d.innerHTML = `<div class="${suitClass}">${card.suit}</div><div style="font-size:16px">${card.rank}</div>`; return d; }

function canAttackLocal(card){
if (LOCAL.table.length===0) return true;
const ranks=new Set(); LOCAL.table.forEach(p=>{ ranks.add(p.attack.rank); if (p.defend) ranks.add(p.defend.rank); });
return ranks.has(card.rank) && LOCAL.table.length < (LOCAL.defender==='player'? LOCAL.playerHand.length : LOCAL.botHand.length);
}
function canDefendLocal(card){
if (LOCAL.table.length===0) return false;
const last = LOCAL.table[LOCAL.table.length-1];
if (!last || last.defend) return false;
if (card.suit === last.attack.suit && (card.value ?? RANK_VALUES[card.rank]) > (last.attack.value ?? RANK_VALUES[last.attack.rank])) return true;
if (card.suit === LOCAL.trumpSuit && last.attack.suit !== LOCAL.trumpSuit) return true;
return false;
}

function attackLocal(index){
const played = LOCAL.playerHand.splice(index,1)[0];
LOCAL.table.push({ attack: played, defend: null });
if (!LOCAL.roundMax) LOCAL.roundMax = 6;
LOCAL.phase='defending';
LOCAL.currentPlayer='bot';
sortHand(LOCAL.playerHand, LOCAL.trumpSuit);
renderAllLocal();
// вызываем сразу, но с небольшой задержкой — чтобы UI обновился
setTimeout(()=>{ try{ botMoveLocal(); } catch(e){ console.error('botMoveLocal error', e); } }, 250);
}

function defendLocal(index){
const last = LOCAL.table[LOCAL.table.length-1];
if (!last || last.defend) return;
const played = LOCAL.playerHand.splice(index,1)[0];
last.defend = played;
const allDef = LOCAL.table.every(p=>p.defend);
if (allDef){
LOCAL.phase='attacking';
LOCAL.currentPlayer = LOCAL.attacker;
sortHand(LOCAL.playerHand, LOCAL.trumpSuit);
renderAllLocal();
// НЕ делаем refill — attacker decides
} else {
LOCAL.currentPlayer = 'bot';
sortHand(LOCAL.playerHand, LOCAL.trumpSuit);
renderAllLocal();
setTimeout(()=>{ try{ botMoveLocal(); } catch(e){ console.error('botMoveLocal error', e); } }, 250);
}
}

function takeCardsLocal(){
for (const p of LOCAL.table){ LOCAL.playerHand.push(p.attack); if (p.defend) LOCAL.playerHand.push(p.defend); }
LOCAL.table = [];
LOCAL.roundMax = null;
refillLocal(true);
showToast('Вы взяли карты');
}

function passLocal(){
if (!(LOCAL.table.length > 0 && LOCAL.table.every(p => p.defend))) { showToast('Нельзя бить: не все пары защищены'); return; }
LOCAL.table = [];
LOCAL.roundMax = null;
refillLocal(false);
showToast('Ход завершён — бито');
}

function refillLocal(defenderTook){
const drawOne=(hand)=>{ if (LOCAL.deck.length) hand.push(LOCAL.deck.pop()); };
const attHand = (LOCAL.attacker==='player')?LOCAL.playerHand:LOCAL.botHand;
const defHand = (LOCAL.defender==='player')?LOCAL.playerHand:LOCAL.botHand;
while ((attHand.length<6 || defHand.length<6) && LOCAL.deck.length){
if (attHand.length<6) drawOne(attHand);
if (defHand.length<6) drawOne(defHand);
}
if (!defenderTook){ const prev = LOCAL.attacker; LOCAL.attacker = LOCAL.defender; LOCAL.defender = prev; }
LOCAL.phase='attacking';
LOCAL.currentPlayer=LOCAL.attacker;
LOCAL.roundMax = null;
sortHand(LOCAL.playerHand, LOCAL.trumpSuit);
sortHand(LOCAL.botHand, LOCAL.trumpSuit);
renderAllLocal();
if (LOCAL.currentPlayer==='bot') setTimeout(()=>{ try{ botMoveLocal(); } catch(e){ console.error('botMoveLocal error', e); } }, 300);
}

/* Improved and robust bot defense/attack logic */
function botMoveLocal(){
console.log('[botMoveLocal] phase=', LOCAL.phase, 'currentPlayer=', LOCAL.currentPlayer, 'attacker=', LOCAL.attacker, 'defender=', LOCAL.defender);
if (LOCAL.phase==='attacking'){
// Bot acts as attacker
if (LOCAL.table.length===0){
if (LOCAL.botHand.length===0){ passLocal(); return; }
// choose weakest non-trump if possible, else weakest trump
let bestIdx = 0; let bestScore = Infinity;
for (let i=0;i<LOCAL.botHand.length;i++){
const c = LOCAL.botHand[i];
const v = (c.suit === LOCAL.trumpSuit ? 100 + (c.value ?? RANK_VALUES[c.rank]) : (c.value ?? RANK_VALUES[c.rank]));
if (v < bestScore){ bestScore = v; bestIdx = i; }
}
const card = LOCAL.botHand.splice(bestIdx,1)[0];
LOCAL.table.push({ attack: card, defend: null });
LOCAL.phase = 'defending';
LOCAL.currentPlayer = 'player';
sortHand(LOCAL.botHand, LOCAL.trumpSuit);
showToast('Бот атакует');
renderAllLocal();
return;
} else {
// Bot may add cards (if allowed)
const ranks=new Set(); LOCAL.table.forEach(p=>{ ranks.add(p.attack.rank); if (p.defend) ranks.add(p.defend.rank); });
const defenderCapacity = LOCAL.defender === 'player' ? LOCAL.playerHand.length : LOCAL.botHand.length;
if (LOCAL.table.length < defenderCapacity){
for (let i=0;i<LOCAL.botHand.length;i++){
if (ranks.has(LOCAL.botHand[i].rank)){
const card = LOCAL.botHand.splice(i,1)[0];
LOCAL.table.push({ attack: card, defend: null });
LOCAL.phase='defending';
LOCAL.currentPlayer='player';
sortHand(LOCAL.botHand, LOCAL.trumpSuit);
renderAllLocal();
return;
}
}
}
// can't add -> finish attack
passLocal();
return;
}
} else if (LOCAL.phase==='defending'){
// Bot defends the last attack
const last = LOCAL.table[LOCAL.table.length - 1];
console.log('[bot defend] last attack=', last && last.attack);
if (!last || last.defend){
// nothing to defend; set phase to attacking and return
LOCAL.phase='attacking';
LOCAL.currentPlayer = LOCAL.attacker;
renderAllLocal();
if (LOCAL.currentPlayer === 'bot') setTimeout(()=>{ try{ botMoveLocal(); } catch(e){ console.error('botMoveLocal error', e); } }, 300);
return;
}

```
// Find same-suit higher card (smallest such), else smallest trump
let sameSuitIdx = -1; let sameSuitVal = Infinity;
let trumpIdx = -1; let trumpVal = Infinity;

for (let i=0;i<LOCAL.botHand.length;i++){
  const c = LOCAL.botHand[i];
  const cVal = (c.value ?? RANK_VALUES[c.rank]);
  // same suit and higher
  if (c.suit === last.attack.suit && cVal > (last.attack.value ?? RANK_VALUES[last.attack.rank])){
    if (cVal < sameSuitVal){ sameSuitVal = cVal; sameSuitIdx = i; }
  }
  // trump candidate
  if (c.suit === LOCAL.trumpSuit && last.attack.suit !== LOCAL.trumpSuit){
    if (cVal < trumpVal){ trumpVal = cVal; trumpIdx = i; }
  }
}

let defendIdx = -1;
if (sameSuitIdx !== -1) defendIdx = sameSuitIdx;
else if (trumpIdx !== -1) defendIdx = trumpIdx;

if (defendIdx === -1){
  // can't defend -> take all
  console.log('[bot defend] cannot defend — taking cards');
  for (const p of LOCAL.table){
    LOCAL.botHand.push(p.attack);
    if (p.defend) LOCAL.botHand.push(p.defend);
  }
  LOCAL.table = [];
  LOCAL.roundMax = null;
  refillLocal(true);
  showToast('Бот взял карты');
  return;
} else {
  // defend with selected card
  const defendCard = LOCAL.botHand.splice(defendIdx,1)[0];
  last.defend = defendCard;
  console.log('[bot defend] defended with', defendCard);
  const all = LOCAL.table.every(p=>p.defend);
  if (all){
    // CORRECT: attacker gets chance to add or press "Бито"
    showToast('Бот отбился');
    LOCAL.phase = 'attacking';
    LOCAL.currentPlayer = LOCAL.attacker;
    sortHand(LOCAL.botHand, LOCAL.trumpSuit);
    sortHand(LOCAL.playerHand, LOCAL.trumpSuit);
    renderAllLocal();
    // DO NOT call refill — wait for attacker decision
    return;
  } else {
    // still not all defended -> set player's turn to defend more (unlikely)
    LOCAL.currentPlayer = 'player';
    sortHand(LOCAL.botHand, LOCAL.trumpSuit);
    renderAllLocal();
    return;
  }
}
```

} else {
console.log('[botMoveLocal] unknown phase', LOCAL.phase);
}
}

function getStatusLocal(){ if (LOCAL.phase==='attacking') return LOCAL.currentPlayer==='player'? '✅ Ваш ход. Атакуйте!' : '🤖 Бот атакует...'; if (LOCAL.phase==='defending') return LOCAL.currentPlayer==='player'? '🛡️ Ваш ход. Защищайтесь!' : '🤖 Бот защищается...'; return ''; }

/* ---------- Multiplayer unchanged ---------- */
let MP = { gameId: null, playerId: null, poll: null, state: null };

async function createRoom(){
try {
const resp = await fetch(API.create, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
const d = await resp.json();
MP.gameId = d.gameId; MP.playerId = d.playerId;
setAssignedId(MP.playerId);
showToast(`Комната ${d.gameId} создана`);
startPolling();
el.board.innerHTML = `<div style="text-align:center;color:white"><h2>Комната ${d.gameId}</h2><p>Ожидание второго игрока...</p></div>`;
} catch (e) { console.error(e); showToast('Не удалось создать комнату'); }
}

async function joinRoomPrompt(){
const codeEl = el.joinInput;
if (!codeEl) return showToast('Поле ввода не найдено');
const code = (codeEl.value || '').toUpperCase().trim();
if (!code || code.length !== 6) return showToast('Введите корректный 6-значный код');
try {
const resp = await fetch(API.join(code), { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
if (!resp.ok){ const t = await resp.text(); throw new Error(t); }
const d = await resp.json();
MP.gameId = d.gameId; MP.playerId = d.playerId;
setAssignedId(MP.playerId);
showToast(`Присоединились к ${d.gameId} как ${MP.playerId}`);
startPolling();
el.board.innerHTML = `<div style="text-align:center;color:white"><h2>Комната ${d.gameId}</h2><p>Ожидание старта...</p></div>`;
} catch (e) { console.error(e); showToast('Не удалось присоединиться'); }
}

function startPolling(){ if (MP.poll) clearInterval(MP.poll); MP.poll = setInterval(refreshGame, 900); refreshGame(); }

async function refreshGame(){
if (!MP.gameId || !MP.playerId) return;
try {
const r = await fetch(API.game(MP.gameId) + `?playerId=${encodeURIComponent(MP.playerId)}`);
if (!r.ok) return;
const s = await r.json();
MP.state = s;
renderMPFromState(s);
if (s.status === 'finished' && MP.poll){ clearInterval(MP.poll); MP.poll = null; }
} catch (e) { /* transient */ }
}

function renderMPFromState(s){
if (el.seats) {
el.seats.innerHTML = (s.seats || []).map(st => {
const short = st.id.length > 14 ? st.id.slice(0,12)+'…' : st.id;
return `<div class="seat ${st.id===s.you?'you':''}">${short}<div style="font-weight:normal;font-size:11px">Карт: ${st.handCount||0}</div></div>`;
}).join('');
}

el.board.innerHTML = '';
const header = document.createElement('div');
header.innerHTML = `     <h2>Комната ${s.id}</h2>     <div class="table-section"><div>Козырь: <strong>${s.trumpSuit || '—'}</strong></div><div style="margin-top:6px;">В колоде: ${s.deckCount}</div></div>     <div class="table-section"><div class="game-status">${getStatusMP(s)}</div></div>
  `;
el.board.appendChild(header);

const you = s.you;
const opponentId = (s.attacker === you ? s.defender : (s.defender === you ? s.attacker : (s.seats && s.seats[0] ? s.seats[0].id : null)));
const opponentSeat = (s.seats||[]).find(x=>x.id===opponentId);
const oppCount = opponentSeat ? opponentSeat.handCount : 0;
const sec = document.createElement('div'); sec.className='opponent-section'; sec.innerHTML = `<h3>Оппонент: ${oppCount}</h3>`;
const row = document.createElement('div'); row.className='opponent-cards';
for (let i=0;i<Math.min(12, oppCount);i++){ const b=document.createElement('div'); b.className='card back'; row.appendChild(b); }
if (oppCount>12){ const more=document.createElement('div'); more.className='card back more'; more.textContent=`+${oppCount-12}`; row.appendChild(more); }
sec.appendChild(row); el.board.appendChild(sec);

if (s.table && s.table.length){
const tsec = document.createElement('div'); tsec.className='table-section'; tsec.innerHTML = '<h3>На столе:</h3>';
const tro = document.createElement('div'); tro.className='table-cards';
s.table.forEach(pair => {
const wrap = document.createElement('div'); wrap.className='card-pair';
wrap.appendChild(cardNodeFromObj(pair.attack, false, s.trumpSuit));
if (pair.defend){ const d = cardNodeFromObj(pair.defend, false, s.trumpSuit); d.classList.add('defended'); wrap.appendChild(d); }
tro.appendChild(wrap);
});
tsec.appendChild(tro); el.board.appendChild(tsec);
}

const hand = s.hand || [];
renderMPActionButtons(s);
renderMPPlayerHand(s, hand);

if (s.you) setAssignedId(s.you);
}

function getStatusMP(s){ if (!s) return ''; if (s.phase === 'attacking') return s.currentPlayer === s.you ? '✅ Ваш ход. Атакуйте!' : '⏳ Ход атакующего...'; if (s.phase === 'defending') return s.currentPlayer === s.you ? '🛡️ Ваш ход. Защищайтесь!' : '♻️ Идёт защита — атакующий может подкидывать'; return ''; }

function renderMPActionButtons(s){
const actions = document.createElement('div'); actions.className='action-buttons';
const you = s.you; const isDef = s.defender === you; const isAtt = s.attacker === you; const isCur = s.currentPlayer === you;
const allDef = s.table && s.table.length > 0 && s.table.every(p => p.defend);
if (s.phase === 'defending' && isDef && isCur){ const take = document.createElement('button'); take.className='secondary danger'; take.textContent='Взять'; take.onclick = ()=> sendMoveMP('take', null); actions.appendChild(take); }
if (allDef && isAtt && isCur && s.phase === 'attacking'){ const pass = document.createElement('button'); pass.className='secondary'; pass.textContent='Бито'; pass.onclick = ()=> sendMoveMP('pass', null); actions.appendChild(pass); }
if (actions.children.length) el.board.appendChild(actions);
}

function renderMPPlayerHand(s, hand){
if (s.trumpSuit) sortHand(hand, s.trumpSuit);
const sec = document.createElement('div'); sec.className='hand-section'; sec.innerHTML = '<h3>Ваши карты:</h3>';
const row = document.createElement('div'); row.className='player-cards';
const you = s.you; const isAtt = s.attacker === you; const isDef = s.defender === you; const isCur = s.currentPlayer === you;
function defenderHandCount(){ if (typeof s.roundMax === 'number' && s.roundMax > 0) return s.roundMax; const d = (s.seats||[]).find(x=>x.id===s.defender); return d? d.handCount : 0; }
for (const card of hand){
const canAttack = (s.phase === 'attacking' && isCur && isAtt);
const canDefend = (s.phase === 'defending' && isCur && isDef);
const canAdd = (s.phase === 'defending' && !isDef && isCur && isAtt);
const clickable = (canAttack && canAttackWithMP(card, s, defenderHandCount())) || (canDefend && canDefendWithMP(card, s)) || (canAdd && canAddWithMP(card, s, defenderHandCount()));
const node = cardNodeFromObj(card, clickable, s.trumpSuit);
if (clickable){
node.addEventListener('click', ()=>{
if (canDefend && canDefendWithMP(card, s)) sendMoveMP('defend', { rank: card.rank, suit: card.suit });
else if (canAttack && canAttackWithMP(card, s, defenderHandCount())) sendMoveMP('attack', { rank: card.rank, suit: card.suit });
else if (canAdd && canAddWithMP(card, s, defenderHandCount())) sendMoveMP('add', { rank: card.rank, suit: card.suit });
}, { passive: true });
}
row.appendChild(node);
}
sec.appendChild(row); el.board.appendChild(sec);
}

function canAttackWithMP(card, s, defenderHandCount){
if (!card) return false;
if ((s.table||[]).length === 0) return ((s.table||[]).length < defenderHandCount);
const rset = new Set(); (s.table||[]).forEach(p=>{ rset.add(p.attack.rank); if (p.defend) rset.add(p.defend.rank); });
return rset.has(card.rank) && (s.table||[]).length < defenderHandCount;
}
function canDefendWithMP(card, s){
if (!card) return false;
if (!s.table || s.table.length === 0) return false;
const last = s.table[s.table.length - 1];
if (!last || last.defend) return false;
if (card.suit === last.attack.suit && RANK_VALUES[card.rank] > RANK_VALUES[last.attack.rank]) return true;
if (card.suit === s.trumpSuit && last.attack.suit !== s.trumpSuit) return true;
return false;
}
function canAddWithMP(card, s, defenderHandCount){
if (!card) return false;
if (!s.table || s.table.length === 0) return false;
if (s.table.length >= defenderHandCount) return false;
const rset = new Set(); (s.table||[]).forEach(p=>{ rset.add(p.attack.rank); if (p.defend) rset.add(p.defend.rank); });
return rset.has(card.rank);
}

function cardNodeFromObj(card, clickable, trumpSuit){
const d = document.createElement('div'); d.className = 'card' + (clickable ? ' clickable' : '');
if (card.suit === trumpSuit) d.classList.add('trump');
const suitClass = (card.suit === '♥' || card.suit === '♦') ? 'suit red' : 'suit black';
d.innerHTML = `<div class="${suitClass}">${card.suit}</div><div style="font-size:16px">${card.rank}</div>`;
return d;
}

async function sendMoveMP(action, card){
if (!MP.gameId || !MP.playerId) return showToast('Не в комнате');
try {
const r = await fetch(`/api/game/${MP.gameId}/move`, {
method: 'POST', headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ playerId: MP.playerId, action, card })
});
const data = await r.json();
if (!r.ok) { showToast(data?.error || 'Ошибка хода'); return; }
setTimeout(refreshGame, 250);
} catch (e) { showToast('Ошибка сети'); }
}

/* UI hookup */
el.startBtn && el.startBtn.addEventListener('click', ()=> initLocalGame());
el.createBtn && el.createBtn.addEventListener('click', ()=> createRoom());
el.joinBtn && el.joinBtn.addEventListener('click', ()=> joinRoomPrompt());

// auto-join from URL ?mode=join&gameId=XXXX
(function autoJoin(){
const p = new URLSearchParams(location.search);
if (p.get('mode') === 'join' && p.get('gameId')){
const g = p.get('gameId');
(async ()=> {
try {
const resp = await fetch(`/api/join-game/${g}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `player_${Date.now()}` }) });
if (!resp.ok) throw new Error('join failed');
const d = await resp.json();
MP.gameId = d.gameId; MP.playerId = d.playerId; setAssignedId(MP.playerId); startPolling();
} catch (e) { console.warn('auto join failed', e); }
})();
}
})();

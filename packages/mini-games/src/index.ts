export type MiniGameId =
  | "haft_khabis" | "chahar_barg" | "rock_paper_scissors" | "shelem"
  | "tic_tac_toe" | "battleship" | "truth_or_dare" | "spy"
  | "backgammon";

export type MiniPlayer = { id: string; seat: number; displayName?: string };
export type MiniAction = { type: string; [key: string]: unknown };
export type MiniGameState = {
  gameId: MiniGameId;
  phase: string;
  players: MiniPlayer[];
  turnPlayerId?: string;
  scores: Record<string, number>;
  round?: number;
  winnerIds?: string[];
  [key: string]: unknown;
};

type Card = { id: string; rank: number; suit: string };
const suits = ["♠","♥","♦","♣"];
const deck = (jokers = false): Card[] => {
  const d: Card[] = [];
  for (const suit of suits) for (let rank=1; rank<=13; rank++) d.push({id:`${suit}${rank}`,rank,suit});
  if (jokers) d.push({id:"J1",rank:0,suit:"J"}, {id:"J2",rank:0,suit:"J"});
  return d;
};
const shuffle = <T>(a:T[], rng=Math.random) => {
  const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x;
};
const nextPlayer = (s:MiniGameState, id:string) => {
  const i=s.players.findIndex(p=>p.id===id); return s.players[(i+1)%s.players.length]?.id;
};
const emptyScores = (players:MiniPlayer[]) => Object.fromEntries(players.map(p=>[p.id,0]));

export function createMiniGame(gameId: MiniGameId, players: MiniPlayer[], rng=Math.random): MiniGameState {
  if (players.length < minPlayers(gameId) || players.length > maxPlayers(gameId)) throw new Error("تعداد بازیکنان این بازی مجاز نیست");
  const base:MiniGameState={gameId,phase:"playing",players:[...players].sort((a,b)=>a.seat-b.seat),scores:emptyScores(players),round:1};
  if(gameId==="haft_khabis"){
    const d=shuffle(deck(true),rng); const hands:Record<string, Card[]>={}; for(const p of players) hands[p.id]=d.splice(0,5);
    return {...base,phase:"playing",hands,deck:d,discard:[d.pop()],turnPlayerId:players[0].id};
  }
  if(gameId==="chahar_barg"){
    const d=shuffle(deck(),rng), hands:any={}; for(const p of players) hands[p.id]=d.splice(0,4);
    return {...base,hands,deck:d,table:d.splice(0,4),captures:Object.fromEntries(players.map(p=>[p.id,[]])),turnPlayerId:players[0].id,phase:"playing"};
  }
  if(gameId==="rock_paper_scissors") return {...base,phase:"round",choices:{},round:1,turnPlayerId:undefined};
  if(gameId==="shelem") return {...base,phase:"bidding",bids:{},bidWinnerId:undefined,bidValue:100,turnPlayerId:players[0].id,tricks:[],hands:{},trump:undefined};
  if(gameId==="tic_tac_toe") return {...base,phase:"playing",board:Array(9).fill(null),marks:{[players[0].id]:"X",[players[1].id]:"O"},turnPlayerId:players[0].id};
  if(gameId==="battleship"){
    const boards:any={},shots:any={}; for(const p of players){boards[p.id]=randomFleet(rng);shots[p.id]=[];}
    return {...base,phase:"playing",boards,shots,turnPlayerId:players[0].id};
  }
  if(gameId==="truth_or_dare") return {...base,phase:"choice",currentPlayerId:players[0].id,prompts:[],turnPlayerId:players[0].id};
  if(gameId==="spy"){
    const locations=["فرودگاه","رستوران","دانشگاه","بیمارستان","هتل","استادیوم","قطار","سینما","موزه","کشتی"];
    const location=locations[Math.floor(rng()*locations.length)], spy=players[Math.floor(rng()*players.length)].id;
    return {...base,phase:"questions",location,spyId:spy,questionIndex:0,questions:[],turnPlayerId:players[0].id};
  }
  if(gameId==="backgammon"){
    const points=initialBackgammon(players); return {...base,phase:"rolling",points,bar:{[players[0].id]:0,[players[1].id]:0},borneOff:{[players[0].id]:0,[players[1].id]:0},dice:[],movesLeft:[],turnPlayerId:players[0].id};
  }
  throw new Error("بازی ناشناخته است");
}

function minPlayers(id:MiniGameId){return id==="tic_tac_toe"||id==="battleship"||id==="rock_paper_scissors"||id==="shelem"||id==="backgammon"?2: id==="spy"?3:2}
function maxPlayers(id:MiniGameId){return id==="tic_tac_toe"||id==="battleship"||id==="backgammon"?2:id==="rock_paper_scissors"||id==="shelem"?4:id==="spy"?10:id==="truth_or_dare"?20:6}

function winLine(b:any[]){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];return lines.find(([a,c,d])=>b[a]&&b[a]===b[c]&&b[a]===b[d]);}

export function applyMiniAction(state:MiniGameState, action:MiniAction, playerId:string, rng=Math.random):MiniGameState {
  const s=structuredClone(state) as MiniGameState;
  if(!s.players.some(p=>p.id===playerId)) throw new Error("بازیکن در اتاق نیست");
  if(s.phase==="finished") throw new Error("بازی تمام شده است");
  if(s.gameId==="tic_tac_toe") return ticTacToe(s,action,playerId);
  if(s.gameId==="rock_paper_scissors") return rps(s,action,playerId);
  if(s.gameId==="truth_or_dare") return truthDare(s,action,playerId);
  if(s.gameId==="spy") return spy(s,action,playerId);
  if(s.gameId==="battleship") return battleship(s,action,playerId);
  if(s.gameId==="haft_khabis") return haft(s,action,playerId);
  if(s.gameId==="chahar_barg") return chaharBarg(s,action,playerId);
  if(s.gameId==="shelem") return shelem(s,action,playerId,rng);
  if(s.gameId==="backgammon") return backgammon(s,action,playerId,rng);
  throw new Error("عملیات بازی پشتیبانی نمی‌شود");
}

function ticTacToe(s:any,a:any,p:string){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(a.type!=="place"||!Number.isInteger(a.cell)||a.cell<0||a.cell>8||s.board[a.cell])throw new Error("خانه نامعتبر است");s.board[a.cell]=s.marks[p];const w=winLine(s.board);if(w){s.phase="finished";s.winnerIds=[p];s.scores[p]+=1;return s;}if(s.board.every(Boolean)){s.phase="finished";s.winnerIds=[];return s;}s.turnPlayerId=nextPlayer(s,p);return s}

function rps(s:any,a:any,p:string){if(a.type!=="choose"||!["سنگ","کاغذ","قیچی"].includes(a.choice))throw new Error("انتخاب نامعتبر است");s.choices[p]=a.choice;if(Object.keys(s.choices).length<s.players.length)return s;const vals=s.players.map((x:any)=>s.choices[x.id]);if(new Set(vals).size===1){s.round++;s.choices={};return s;}const beats:any={سنگ:"قیچی",قیچی:"کاغذ",کاغذ:"سنگ"};const winners=s.players.filter((x:any)=>s.players.every((y:any)=>x.id===y.id||beats[s.choices[x.id]]===s.choices[y.id]));if(winners.length===1){s.scores[winners[0].id]++;if(s.scores[winners[0].id]>=3){s.phase="finished";s.winnerIds=[winners[0].id];}else{s.round++;s.choices={};}}else{s.round++;s.choices={};}return s}

const truth=["بزرگ‌ترین سوتی‌ات چه بوده؟","آخرین دروغی که گفتی چه بود؟","چه کاری را همیشه عقب می‌اندازی؟","از چه چیزی بیشتر می‌ترسی؟","به چه کسی بیشتر از همه اعتماد داری؟"];
const dare=["۱۰ ثانیه آواز بخوان.","یک حرکت خنده‌دار اجرا کن.","با صدای ربات یک جمله بگو.","یک لطیفه تعریف کن.","۵ بار دست بزن و اسم خودت را بگو."];
function truthDare(s:any,a:any,p:string){if(s.currentPlayerId!==p&&a.type!=="choose_player")throw new Error("نوبت شما نیست");if(a.type==="choose"){if(!["جرأت","حقیقت"].includes(a.kind))throw new Error("نوع نامعتبر است");s.prompts.push({playerId:p,kind:a.kind,text:(a.kind==="حقیقت"?truth:dare)[Math.floor(Math.random()*(a.kind==="حقیقت"?truth:dare).length)]});s.currentPlayerId=nextPlayer(s,p);s.turnPlayerId=s.currentPlayerId;return s;}if(a.type==="skip"){s.currentPlayerId=nextPlayer(s,p);s.turnPlayerId=s.currentPlayerId;return s;}throw new Error("عملیات نامعتبر")}

function spy(s:any,a:any,p:string){if(a.type==="ask"){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(!a.text?.trim())throw new Error("سؤال خالی است");s.questions.push({from:p,text:String(a.text)});s.questionIndex++;s.turnPlayerId=nextPlayer(s,p);return s;}if(a.type==="accuse"){if(!s.players.some((x:any)=>x.id===a.playerId))throw new Error("بازیکن نامعتبر");s.phase="finished";const correct=a.playerId===s.spyId;s.winnerIds=correct?s.players.filter((x:any)=>x.id!==s.spyId).map((x:any)=>x.id):[s.spyId];s.winnerIds.forEach((id:string)=>s.scores[id]++);return s;}if(a.type==="reveal"){s.phase="finished";s.winnerIds=[s.spyId];s.scores[s.spyId]++;return s;}throw new Error("عملیات نامعتبر")}

function battleship(s:any,a:any,p:string){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(a.type!=="fire"||!Number.isInteger(a.cell)||a.cell<0||a.cell>99)throw new Error("مختصات نامعتبر است");const opp=s.players.find((x:any)=>x.id!==p);if(s.shots[p].some((x:any)=>x.cell===a.cell))throw new Error("این خانه قبلاً شلیک شده");const hit=s.boards[opp.id].includes(a.cell);s.shots[p].push({cell:a.cell,hit});const remaining=s.boards[opp.id].filter((c:number)=>!s.shots[p].some((x:any)=>x.cell===c));if(!remaining.length){s.phase="finished";s.winnerIds=[p];s.scores[p]+=1;}else s.turnPlayerId=opp.id;return s}

function haft(s:any,a:any,p:string){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");const hand=s.hands[p];const top=s.discard[s.discard.length-1];if(a.type==="draw"){const card=s.deck.pop();if(!card)throw new Error("کارت تمام شده");hand.push(card);return s;}if(a.type!=="play")throw new Error("عملیات نامعتبر");const i=hand.findIndex((c:any)=>c.id===a.cardId);if(i<0)throw new Error("کارت در دست شما نیست");const c=hand[i];if(c.suit!==top.suit&&c.rank!==top.rank&&c.rank!==7&&top.rank!==7)throw new Error("کارت قابل بازی نیست");hand.splice(i,1);s.discard.push(c);if(!hand.length){s.phase="finished";s.winnerIds=[p];s.scores[p]+=1;return s;}if(c.rank===7)s.special="هفت: بازیکن بعدی یک کارت می‌کشد";s.turnPlayerId=nextPlayer(s,p);return s}

function chaharBarg(s:any,a:any,p:string){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(a.type==="deal"){if(s.deck.length){for(const pl of s.players){s.hands[pl.id].push(...s.deck.splice(0,4));}if(!s.deck.length)s.phase="finished";}return s;}if(a.type!=="capture")throw new Error("عملیات نامعتبر");const hand=s.hands[p];const i=hand.findIndex((c:any)=>c.id===a.cardId);if(i<0)throw new Error("کارت در دست شما نیست");const c=hand[i];const indexes=s.table.map((x:any,j:number)=>x.rank===c.rank?j:-1).filter((x:number)=>x>=0);if(!indexes.length)throw new Error("کارت مشابه روی میز نیست");hand.splice(i,1);const captured=indexes.map((j:number)=>s.table[j]);s.table=s.table.filter((_:any,j:number)=>!indexes.includes(j));s.captures[p].push(c,...captured);if(!s.table.length)s.scores[p]+=1;s.turnPlayerId=nextPlayer(s,p);if(s.deck.length===0&&s.players.every((pl:any)=>!s.hands[pl.id].length)){s.phase="finished";s.winnerIds=[...s.players].sort((a:any,b:any)=>s.scores[b.id]-s.scores[a.id]).slice(0,1).map((x:any)=>x.id)}return s}

function shelem(s:any,a:any,p:string,rng:number){if(s.phase==="bidding"){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(a.type!=="bid"||!Number.isInteger(a.value)||a.value<100||a.value%5)throw new Error("خواندن امتیاز نامعتبر است");s.bids[p]=a.value;if(!s.bidValue||a.value>=s.bidValue){s.bidValue=a.value;s.bidWinnerId=p;}s.turnPlayerId=nextPlayer(s,p);if(Object.keys(s.bids).length===s.players.length){s.phase="playing";s.trump=["♠","♥","♦","♣"][Math.floor(rng()*4)];s.turnPlayerId=s.bidWinnerId;}return s}if(a.type==="finish_round"){s.phase="finished";s.winnerIds=[s.bidWinnerId];s.scores[s.bidWinnerId]+=s.bidValue||100;return s;}throw new Error("در نسخه اول شلم، فاز بازی با ثبت دست‌ها تکمیل می‌شود")}

function initialBackgammon(players:MiniPlayer[]){const p:any=Object.fromEntries(players.map(x=>[x.id,Array(24).fill(0)]));const a=players[0].id,b=players[1].id;p[a][0]=2;p[a][11]=5;p[a][16]=3;p[a][18]=5;p[b][23]=-2;p[b][12]=-5;p[b][7]=-3;p[b][5]=-5;return p}
function backgammon(s:any,a:any,p:string,rng:number){if(s.turnPlayerId!==p)throw new Error("نوبت شما نیست");if(a.type==="roll"){if(s.dice.length)throw new Error("تاس قبلاً ریخته شده");s.dice=[1+Math.floor(rng()*6),1+Math.floor(rng()*6)];s.movesLeft=[...s.dice];s.phase="moving";return s;}if(a.type==="move"){const from=Number(a.from),to=Number(a.to);if(!s.movesLeft.length||!Number.isInteger(from)||!Number.isInteger(to))throw new Error("حرکت نامعتبر");const distance=Math.abs(to-from);const i=s.movesLeft.indexOf(distance);if(i<0)throw new Error("این حرکت با تاس ممکن نیست");const pts=s.points[p];if((pts[from]||0)<=0)throw new Error("مهره شما در این خانه نیست");pts[from]--;pts[to]=(pts[to]||0)+(p===s.players[0].id?1:-1);s.movesLeft.splice(i,1);if(!s.movesLeft.length){s.dice=[];s.phase="rolling";s.turnPlayerId=nextPlayer(s,p);}return s;}throw new Error("عملیات نامعتبر")}

function randomFleet(rng=Math.random){const cells:number[]=[];const ships=[4,3,3,2];for(const len of ships){let placed=false;for(let tries=0;tries<500&&!placed;tries++){const horizontal=rng()<.5;const r=Math.floor(rng()*10),c=Math.floor(rng()*10);const candidate:number[]=[];for(let k=0;k<len;k++){const rr=r+(horizontal?0:k),cc=c+(horizontal?k:0);if(rr>9||cc>9)break;candidate.push(rr*10+cc)}if(candidate.length===len&&candidate.every(x=>!cells.includes(x))){cells.push(...candidate);placed=true}}}return cells}

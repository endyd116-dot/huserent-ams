import { getStore } from "@netlify/blobs";

const INITIAL = {
  users: [
    { id:"admin", pw:"1234", name:"김성태(대표)", role:"Admin", contact:"010-1234-5678", email:"admin@qj.com", permissions:[1,2,3,4,5,6], tagColor:"#475569" },
    { id:"manager1", pw:"1234", name:"박보람(맨투)", role:"Manager", contact:"010-2222-3333", email:"m1@qj.com", permissions:[1,2,3], tagColor:"#60a5fa" },
    { id:"manager2", pw:"1234", name:"최진호(하니)", role:"Manager", contact:"010-4444-5555", email:"m2@qj.com", permissions:[4,5], tagColor:"#f472b6" },
    { id:"staff1", pw:"1234", name:"이철수(실장)", role:"Director", contact:"010-9999-0000", email:"s1@qj.com", permissions:[1,2,3,4,5,6], tagColor:"#94a3b8" }
  ],
  properties: [
    { id:1, name:"강남 스테이 M3", group:"서울", location:"서울 강남구 역삼동", address:"서울 강남구 테헤란로 123", price:120000, cost:45000, status:"occupied", image:"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800", description:"강남역 도보 5분", manager:"manager1", repair:"완료", cleaning:"완료", gas:"도시가스", internet:"KT" },
    { id:2, name:"송파 갤러리 M4", group:"서울", location:"송파구 잠실동", address:"서울 송파구 올림픽로 300", price:155000, cost:55000, status:"empty", image:"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800", description:"석촌호수 조망", manager:"manager1" },
    { id:3, name:"마포 루프탑", group:"서울", location:"마포구 연남동", address:"서울 마포구 연남로 45", price:110000, cost:38000, status:"cleaning", image:"https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800", description:"연트럴파크 인근", manager:"manager1" },
    { id:4, name:"해운대 오션", group:"부산", location:"해운대구 우동", address:"부산 해운대구 해운대로 620", price:240000, cost:95000, status:"occupied", image:"https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800", description:"광안대교 오션뷰", manager:"manager2" },
    { id:5, name:"제주 우드 빌라", group:"제주", location:"애월읍", address:"제주 애월읍 하귀리 123", price:380000, cost:130000, status:"empty", image:"https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800", description:"프라이빗 숲속", manager:"manager2" },
    { id:6, name:"성수 테크 스튜디오", group:"서울", location:"성동구 성수동", address:"서울 성동구 성수이로 88", price:135000, cost:42000, status:"occupied", image:"https://images.unsplash.com/photo-1536376074432-cd4258d7c264?w=800", description:"성수동 카페거리", manager:"manager1" }
  ],
  bookings: [
    { id:201, propId:1, guest:"이지은", checkIn:"2026-04-20", checkOut:"2026-04-25", price:620000, contact:"010-1111-2222", nationality:"한국", people:2, platform:"Airbnb", memo:"" },
    { id:202, propId:4, guest:"James Song", checkIn:"2026-04-21", checkOut:"2026-04-24", price:720000, contact:"010-3333-4444", nationality:"미국", people:4, platform:"Booking.com", memo:"" }
  ],
  expenses: [
    { id:1, propId:1, majorCat:"변동지출", category:"청소비", amount:45000, date:"2026-04-21", memo:"퇴실 청소" },
    { id:2, propId:4, majorCat:"변동지출", category:"수선비", amount:120000, date:"2026-04-19", memo:"에어컨" }
  ],
  chats: [],
  groups: ["서울","부산","제주"],
  platforms: [
    {name:"Airbnb",color:"#ff5a5f"},
    {name:"Booking.com",color:"#003580"},
    {name:"Agoda",color:"#ea4335"},
    {name:"네이버",color:"#03c75a"},
    {name:"직접예약",color:"#6366f1"}
  ],
  majorCats: ["초기투자지출","고정지출","변동지출"],
  subCats: {
    "초기투자지출":["초기세팅비","리모델링비","가구구입비","가전구입비"],
    "고정지출":["월세","관리비","인터넷비","도시가스","전기요금"],
    "변동지출":["청소비","비품비","수선비","광고비","수수료"]
  },
  internet: [
    { id:1001, propId:1, provider:"KT", plan:"기가 인터넷", monthly:33000, installDate:"2025-01-15", contract:"3년", wifiId:"QJ_M3", wifiPw:"qj12345" }
  ],
  products: [
    { id:2001, category:"침구", name:"호텔식 베개", price:45000, url:"https://coupang.com/a1", image:"", memo:"4인룸 2개", vendor:"쿠팡" }
  ],
  schedule: [],
  logs: [],
  profileRequests: [],
  reportRecipients: ["admin"],
  userNotifs: {},
  opsData: {}
};

export default async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const force = url.searchParams.get("force") === "1";
  
  if (secret !== (process.env.SEED_SECRET || "init-qj-2026")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore({ name: "qj-pms-data", consistency: "strong" });
  const results = {};

  for (const [key, value] of Object.entries(INITIAL)) {
    const existing = await store.get(key, { type: "json" });
    const isEmpty = !existing || (Array.isArray(existing) && existing.length === 0);
    
    if (isEmpty || force) {
      await store.setJSON(key, value);
      results[key] = `✅ seeded`;
    } else {
      results[key] = `⏭️ skipped`;
    }
  }

  return new Response(JSON.stringify({ message: "🎉 Seed complete", results }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};

export const config = { path: "/api/seed" };
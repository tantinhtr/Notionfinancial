import { normalizeSearchText_ } from "../finance/shared.js";
export function plainText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || '').join('');
}

export function stripFundPrefix_(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^qu\S*\s+/, '')
    .trim();
}

// Anh ghi chu bang tay theo quy uoc "( lay tu quy X )" / "( tinh vao quy X )".
// Uu tien doc phan trong ngoac, roi moi den ca cau. Chi nhan khi sau dong tu la
// mot chu bat dau bang "qu", nho vay loi go "quxy sua xe" van ve "quy sua xe",
// con "Tuan muon tien thi bang lai xe" khong de ra mot quy ma.
function fundMentionedAfter_(expenseRow, verbPattern, requireFundWord = true) {
  const props = expenseRow.properties || {};
  const text =
    plainText_(props['Nội Dung Khoản Chi']) +
    ' | ' +
    plainText_(props['Ghi Chú']);
  const candidates = [];
  const paren = /\(([^)]*)\)/g;
  let found;
  while ((found = paren.exec(text)) !== null) candidates.push(found[1]);
  candidates.push(text);
  for (const candidate of candidates) {
    const match = candidate.match(verbPattern);
    if (!match) continue;
    const cleaned = match[1].replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    const hasFundWord = /^qu\S*\s+/i.test(cleaned);
    if (requireFundWord && !hasFundWord) continue;
    const name = (hasFundWord ? cleaned.replace(/^qu\S*\s+/i, '') : cleaned)
      .trim()
      .slice(0, 60);
    if (name !== '') return 'quỹ ' + name;
  }
  return '';
}

// "lay tu / muon quy X" — khoan nay tieu tien cua quy X, sinh ra mon no voi quy do.
export function borrowedFrom_(expenseRow) {
  return fundMentionedAfter_(
    expenseRow,
    /(?:lấy\s+từ|mượn(?:\s+từ)?)\s+(.+)$/i,
  );
}

// Khoan nay thuoc ngan sach nhom nao. Uu tien cum "tinh vao quy X"; neu khong co
// thi chi can tieu de/ghi chu NHAC TOI ten mot nhom quy co that la du — anh viet tat
// kieu "( phat sinh )" van phai an. Khong nhan khi ten do chinh la ben cho muon
// ("lay tu quy X"), vi do la nguon tien chu khong phai ngan sach.
// Ten nhom quy chi tinh la duoc nhac toi khi no DI SAU chu "quy" va KET THUC tron
// ven. Thieu hai dieu kien do thi "Gửi xe đi chợ" bi keo vao nhom Đi Chợ, va
// "( lấy từ quỹ đi chơi với em )" cung bi cat thanh "quỹ đi chợ".
function mentionsFund_(normalizedText, key) {
  const needle = normalizeSearchText_(key);
  if (needle === '') return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('qu\\S*\\s+' + escaped + '(?![a-z0-9])').test(
    normalizedText,
  );
}

// Ghi chu co the goi ten LO ("quỹ nhu cầu thiết yếu") hoac ten NHAN CON
// ("quỹ phát sinh"). Ca hai deu hop le: nhan con thuoc lo nao thi khoan do ve lo do,
// va con duoc ghi dung vao dong con — nho vay bao cao khong mat chi tiet.
export function assignedFund_(expenseRow, assignmentKeys) {
  // "tinh vao X" khong bat buoc phai co chu "quỹ": X da duoc doi chieu voi danh sach
  // ten co that ngay duoi, ten bia ra thi khong khop nen khong can canh gac do nua.
  // Viet "( tính vào phát triển bản thân )" phai an nhu "( tính vào quỹ phát sinh )".
  const explicit = stripFundPrefix_(
    fundMentionedAfter_(expenseRow, /tính\s+vào\s+(.+)$/i, false),
  );
  if (explicit !== '') {
    if (assignmentKeys[explicit]) return explicit;
    // Ghi chu con chu thua phia sau ("tính vào phát sinh nhé") thi lay ten dai nhat
    // ma cau do bat dau bang.
    const normalized = normalizeSearchText_(explicit);
    let matched = '';
    for (const key of Object.keys(assignmentKeys)) {
      const candidate = normalizeSearchText_(key);
      if (candidate === '' || !normalized.startsWith(candidate + ' ')) continue;
      if (candidate.length > matched.length) matched = key;
    }
    if (matched !== '') return matched;
  }
  const props = expenseRow.properties || {};
  const text = normalizeSearchText_(
    plainText_(props['Nội Dung Khoản Chi']) +
      ' ' +
      plainText_(props['Ghi Chú']),
  );
  const lenderKey = stripFundPrefix_(borrowedFrom_(expenseRow));
  let best = '';
  for (const key of Object.keys(assignmentKeys)) {
    if (key === '' || key === lenderKey) continue;
    if (!mentionsFund_(text, key)) continue;
    if (key.length > best.length) best = key;
  }
  return best;
}

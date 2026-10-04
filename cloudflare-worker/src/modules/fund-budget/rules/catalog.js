/**
 * Lập danh mục tài khoản, ngân sách cố định, tên nhóm và tên gọi khác của nhãn.
 * Phân biệt tên nhóm lớn với nhãn con để không gán sai nơi chi tiêu.
 */
import { num_ } from "../../shared/finance/shared.js";
import { plainText_, stripFundPrefix_ } from "./assignment.js";

export function buildBudgetCatalog({ categoryRows, accountRows, fundGroupRows, options }) {
  const categoryNames = {};
  const categoryGroupIds = {};
  const fundGroupIdByName = {};
  const pendingAliases = [];
  // Doi ten lo thi ghi chu cu ("lấy từ quỹ thiết yếu") van phai khop. Cot "Tên Cũ"
  // trong Notion liet ke cac ten cu, cach nhau bang dau phay.
  const groupAliasKeys = {};
  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props['Tên Nhóm Quỹ'] && props['Tên Nhóm Quỹ'].title) || [];
    if (!title.length) continue;
    const realKey = stripFundPrefix_(title[0].plain_text);
    fundGroupIdByName[realKey] = fundGroupRow.id;
    groupAliasKeys[fundGroupRow.id] = { [realKey]: true };
    for (const alias of plainText_(props['Tên Cũ']).split(',')) {
      const key = stripFundPrefix_(alias);
      if (key === '') continue;
      groupAliasKeys[fundGroupRow.id][key] = true;
      pendingAliases.push({ key, groupId: fundGroupRow.id });
    }
  }
  const groupNameKeys = Object.keys(fundGroupIdByName);
  const groupIdSet = {};
  for (const key of groupNameKeys) groupIdSet[fundGroupIdByName[key]] = true;
  // Ten goi duoc phep viet trong ghi chu: ten lo -> ca lo, ten nhan con -> dung nhan do.
  const assignmentKeys = {};
  for (const key of groupNameKeys) {
    assignmentKeys[key] = { groupId: fundGroupIdByName[key], categoryId: '' };
  }
  const accountNames = {};
  const fixedIdMap = {};
  const fixedBudgets = [];
  let totalFixedBudget = 0;
  const historicalChildSources = {};
  for (const expenseRow of options.historicalExpenseRows || []) {
    const props = expenseRow.properties || {};
    const categoryId =
      ((props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [])[0]
        ?.id || '';
    const source = (
      plainText_(props['Nội Dung Khoản Chi']) +
      ' ' +
      plainText_(props['Ghi Chú'])
    ).trim();
    if (!categoryId || !source) continue;
    if (!historicalChildSources[categoryId])
      historicalChildSources[categoryId] = [];
    historicalChildSources[categoryId].push(source);
  }

  for (const categoryRow of categoryRows) {
    const props = categoryRow.properties || {};
    const title = (props['Loại Chi Phí'] && props['Loại Chi Phí'].title) || [];
    const name = title.length ? title[0].plain_text : '(chưa phân loại)';
    categoryNames[categoryRow.id] = name;
    const groupRelation =
      (props['Nhóm Quỹ'] && props['Nhóm Quỹ'].relation) || [];
    categoryGroupIds[categoryRow.id] = groupRelation.length
      ? groupRelation[0].id
      : '';
    if (
      !(
        props['Tính Trong 5,5 Triệu'] &&
        props['Tính Trong 5,5 Triệu'].checkbox === true
      )
    ) {
      continue;
    }
    const budget = num_(props['Ngân Sách Tháng']);
    // Nhan con tick "Chi Thang Khong Qua Quy" thi khong bao gio can bom truoc vao
    // tai khoan giu quy — vi du Đi Chợ tra thang bang tien mat. Notion tra ve false
    // cho o chua tick, nen phai hoi nguoc kieu nay: mac dinh la VAN theo co cua lo.
    const skipsFund = !!(
      props['Chi Thẳng Không Qua Quỹ'] &&
      props['Chi Thẳng Không Qua Quỹ'].checkbox === true
    );
    const fixed = {
      id: categoryRow.id,
      groupId: categoryGroupIds[categoryRow.id],
      name,
      budget,
      skipsFund,
      spent: 0,
      remaining: budget,
      over: 0,
      missingCategory: false,
      paidByAccount: {},
      accountBreakdown: [],
      spendRows: [],
    };
    fixedBudgets.push(fixed);
    fixedIdMap[fixed.id] = fixed;
    totalFixedBudget += fixed.budget;
    const childKey = stripFundPrefix_(name);
    // Ten lo uu tien hon: neu trung ten thi giu nghia "ca lo".
    if (childKey !== '' && !assignmentKeys[childKey]) {
      assignmentKeys[childKey] = {
        groupId: fixed.groupId,
        categoryId: fixed.id,
      };
    }
  }

  // Ten cu cua lo chi duoc dung khi khong dung ten nhan con nao. Vi du doi ten
  // "Phát Sinh" tu lo thanh nhan con: ghi chu "quỹ phát sinh" phai ve dung nhan do,
  // khong duoc ve chung ca lo.
  for (const alias of pendingAliases) {
    if (!assignmentKeys[alias.key]) {
      assignmentKeys[alias.key] = { groupId: alias.groupId, categoryId: '' };
    }
  }

  for (const accountRow of accountRows) {
    const props = accountRow.properties || {};
    const title =
      (props['Phương Thức Thanh Toán'] &&
        props['Phương Thức Thanh Toán'].title) ||
      [];
    accountNames[accountRow.id] = title.length
      ? title[0].plain_text
      : '(chưa chọn tài khoản)';
  }

  return { categoryNames, categoryGroupIds, fundGroupIdByName, groupAliasKeys, assignmentKeys, fixedIdMap, fixedBudgets, totalFixedBudget, historicalChildSources, accountNames, groupIdSet };
}

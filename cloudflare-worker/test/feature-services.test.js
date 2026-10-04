import test from "node:test";
import assert from "node:assert/strict";
import { createIncomeGoalService } from "../src/modules/income-goal/income-goal.service.js";
import { createCashflowService } from "../src/modules/cashflow/cashflow.service.js";

test("income application uses data contract and invalidation without a network client", async () => {
  const calls=[];
  const repository={
    async findByUpdateId(id){ calls.push(["find",id]); return null; },
    async insertRecord(id,date,amount){calls.push(["insert",id,date,amount]); return {id:"page"};},
    async readGoalRows(){return {goalRows:[],incomeRows:[]};}
  };
  const service=createIncomeGoalService({repository, config:{timezone:"Asia/Ho_Chi_Minh"},
    now:()=>new Date("2026-09-30T18:00:00Z"), invalidateReports:async date=>calls.push(["invalidate",date])});
  await service.recordRevenue(9,50000);
  assert.deepEqual(calls,[["find","9"],["insert","9","2026-10-01",50000],["invalidate","2026-10-01"]]);
});

test("income application distinguishes ambiguous writes from optional invalidation failure", async () => {
  let writes=0, failWrite=false;
  const repository={async findByUpdateId(){return null;},async insertRecord(){writes++;if(failWrite)throw Error("network");return {id:"p"};}};
  const service=createIncomeGoalService({repository,config:{timezone:"UTC"},invalidateReports:async()=>{throw Error("cache");}});
  assert.equal((await service.addGrabIncome(1,"2026-10-01",20)).created,true);
  failWrite=true;
  await assert.rejects(service.addGrabIncome(2,"2026-10-01",20),e=>e.code==="AMBIGUOUS_INCOME_WRITE");
  assert.equal(writes,2);
});

test("cashflow service caches computed reports while its data port only returns rows", async () => {
  let reads=0; const saved=new Map();
  const service=createCashflowService({repository:{async readMonth(){reads++;return {accountRows:[],incomeRows:[],otherIncomeRows:[],expenseRows:[],transferRows:[],incomeCategoryRows:[],otherIncomeCategoryRows:[],expenseCategoryRows:[]};}},
    cache:{async get(k){return saved.get(k);},async set(k,v){saved.set(k,v);},async delete(k){saved.delete(k);}},
    config:{timezone:"UTC"},now:()=>new Date("2026-10-04T00:00:00Z")});
  const first=await service.getMonthlyCashflow();
  assert.deepEqual(await service.getMonthlyCashflow(),first); assert.equal(reads,1);
  await service.invalidate("2026-10-04"); await service.getMonthlyCashflow(); assert.equal(reads,2);
});

import { evaluateFinanceLedger } from "../src/modules/financial-ledger/index.js";
import { createBudgetCalculator } from "../src/modules/fund-budget/index.js";
import { buildFinanceLedger_ } from "../src/ledger.js";

test("ledger consumes supplied opening plan without computing or mutating it", () => {
  const plan=Object.freeze({sourceTotal:500, rentReserve:100, rentShortfall:0, remainder:400,
    sourceAccounts:Object.freeze([]), allocations:Object.freeze([])});
  const result=evaluateFinanceLedger({openingPlan:plan});
  assert.deepEqual(result.openingPlan,plan);
  assert.notEqual(result.openingPlan,plan);
  assert.equal(result.openingPlan.remainder,400);
});

test("budget calculation uses its injected evaluator, including historical rollover", () => {
  let calls=0;
  const calculator=createBudgetCalculator(input=>{calls++;return evaluateFinanceLedger(input);});
  const report=calculator.buildReport({y:2026,m:10,d:1},[],[],[],5500000,[],[],{});
  assert.equal(calls,1); assert.deepEqual(report.explicitLedger,buildFinanceLedger_({}));
  calculator.calculateRollover({t:{y:2026,m:11,d:1},categoryRows:[],accountRows:[],fundGroupRows:[],rolloverExpenseRows:[],rolloverTransferRows:[],config:{monthlyExpenseLimit:5500000,rolloverSourceGroupNames:[]}});
  assert.equal(calls,2);
});

test("confirmed duplicate income does not create or invalidate", async () => {
  const service=createIncomeGoalService({repository:{async findByUpdateId(){return {id:"existing"};},async insertRecord(){assert.fail("duplicate write");}},config:{timezone:"UTC"},invalidateReports:async()=>assert.fail("duplicate invalidation")});
  assert.deepEqual(await service.addGrabIncome(8,"2026-10-04",50000),{created:false,page:{id:"existing"}});
});

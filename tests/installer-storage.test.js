"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { beforeBundledBoot } = require("../desktop/runtime-updates/installer-storage");
const { copyHome, identity } = require("../desktop/runtime-updates/manager");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "one-installer-test-"));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const home = path.join(dir,"home"), root = path.join(dir,"updates"), resources = path.join(dir,"resources");
  for (const folder of [root,path.join(home,"postgres"),path.join(home,"store"),path.join(home,"one-account"),path.join(resources,"core")]) fs.mkdirSync(folder,{recursive:true});
  const config = {installation_id:"owned",database_password:"unchanged",encryption_key:"unchanged"};
  const configFile = path.join(home,"installation.json"), attachment = Buffer.from([0,255,10,5]);
  fs.writeFileSync(configFile,JSON.stringify(config));
  fs.writeFileSync(path.join(home,"store/attachment"),attachment);
  fs.writeFileSync(path.join(home,"store/record"),"original record");
  fs.writeFileSync(path.join(home,"one-account/activation.json"),"unchanged activation");
  const wheel = path.join(resources,"core/candidate.whl"); fs.writeFileSync(wheel,"reviewed wheel");
  fs.writeFileSync(path.join(resources,"core/storage-upgrade.json"),JSON.stringify({schemaVersion:1,managedStorage:true,wheelSha256:digest("reviewed wheel")}));
  const planFile=path.join(dir,"plan.json"), plan={version:1,home:fs.realpathSync(home),installation_id:"owned",wheel_sha256:digest("reviewed wheel"),plan:{hash:"approved-core-plan",runtime_role:"restricted"}};
  fs.writeFileSync(planFile,JSON.stringify(plan));
  const approved=digest(fs.readFileSync(planFile)), journal=path.join(root,"installer-storage.json");
  let running=false, starts=0, applies=0;
  const cli={file:"uv",args:["tool","run","--from",wheel,"integral"]};
  const options={home,root,resources,cli,version:"0.1.1rc63",argv:["app",`--installer-storage-plan=${planFile}`,`--installer-storage-approved-hash=${approved}`],copyHome,identity,
    cliRunner:async (_cli,args)=>{
      if(args[0]==="status") return {state:running?"ready":"stopped"};
      if(args[0]==="stop") {assert.deepEqual(args.slice(-4),["--if-pid","123","--if-created","456"]);running=false;return {state:"stopped"};}
      assert.equal(args[0],"storage-upgrade");applies++;
      const updated={...config,runtime_database_user:"restricted",runtime_database_password:"a".repeat(64)};
      fs.writeFileSync(configFile,JSON.stringify(updated));
      return {plan_hash:plan.plan.hash,runtime_user:"restricted",password_sha256:digest(updated.runtime_database_password)};
    },
    start:async()=>{starts++;running=true;return {owned:true,version:"0.1.1rc63",installation_id:"owned",pid:123,process_created:456,cli};},
  };
  return {home,root,dir,options,config,configFile,attachment,planFile,journal,approved,plan,
    boot:()=>beforeBundledBoot(options), counts:()=>({starts,applies}), live:()=>{running=true;},
    state:()=>JSON.parse(fs.readFileSync(journal)), save:s=>fs.writeFileSync(journal,JSON.stringify(s))};
}
test("replacement installer migrates once, preserves identity/data and retains its cold snapshot",async t=>{
  const f=fixture(t), before=identity(f.home); await f.boot();
  assert.equal(f.state().phase,"complete");assert.ok(fs.existsSync(f.state().snapshot));
  assert.deepEqual(identity(f.home).accounts,before.accounts);
  assert.deepEqual(fs.readFileSync(path.join(f.home,"store/attachment")),f.attachment);
  assert.equal(fs.readFileSync(path.join(f.home,"store/record"),"utf8"),"original record");
  await f.boot();assert.deepEqual(f.counts(),{starts:1,applies:1});
});
for(const mode of ["missing-approval","changed-plan","wrong-wheel","wrong-home","partial-credentials","live-home","linked-home"]){
 test(`replacement installer fails closed before copying or applying: ${mode}`,async t=>{
  const f=fixture(t);
  if(mode==="missing-approval")f.options.argv=[];
  if(mode==="changed-plan")fs.appendFileSync(f.planFile," ");
  if(mode==="wrong-wheel"||mode==="wrong-home"){
   f.plan[mode==="wrong-wheel"?"wheel_sha256":"home"]="wrong";fs.writeFileSync(f.planFile,JSON.stringify(f.plan));
   f.options.argv[2]=`--installer-storage-approved-hash=${digest(fs.readFileSync(f.planFile))}`;
  }
  if(mode==="partial-credentials")fs.writeFileSync(f.configFile,JSON.stringify({...f.config,runtime_database_user:"unreviewed"}));
  if(mode==="live-home")f.live();
  if(mode==="linked-home") {const moved=f.home+"-real";fs.renameSync(f.home,moved);fs.symlinkSync(moved,f.home,"junction");}
  await assert.rejects(f.boot());assert.deepEqual(f.counts(),{starts:0,applies:0});assert.ok(!fs.existsSync(f.journal));
 });
}
for(const mode of ["apply-error","forged-receipt","wrong-trial","trial-key-change"]){
 test(`replacement installer restores the complete old home after ${mode}`,async t=>{
  const f=fixture(t), original=f.options.cliRunner, start=f.options.start;
  f.options.cliRunner=async (cli,args)=>{
   const result=await original(cli,args);
   if(args[0]==="storage-upgrade"){
    fs.writeFileSync(path.join(f.home,"store/record"),"migration partial");
    fs.writeFileSync(path.join(f.home,"store/attachment"),"attachment partial");
    if(mode==="apply-error")throw Error("failure");
    if(mode==="forged-receipt")return {...result,password_sha256:"b".repeat(64)};
   }return result;
  };
  f.options.start=async()=>{const result=await start();if(mode==="trial-key-change")fs.writeFileSync(f.configFile,JSON.stringify({...JSON.parse(fs.readFileSync(f.configFile)),encryption_key:"changed"}));return mode==="wrong-trial"?{...result,version:"old"}:result;};
  await assert.rejects(f.boot(),/old home was restored/);
  assert.equal(f.state().phase,"rolled-back");assert.deepEqual(JSON.parse(fs.readFileSync(f.configFile)),f.config);
  assert.deepEqual(fs.readFileSync(path.join(f.home,"store/attachment")),f.attachment);
  assert.equal(fs.readFileSync(path.join(f.home,"store/record"),"utf8"),"original record");
  assert.equal(fs.readFileSync(path.join(f.state().retainedHome,"store/record"),"utf8"),"migration partial");
  const count=f.counts();await assert.rejects(f.boot(),/rolled back/);assert.deepEqual(f.counts(),count);
 });
}
for(const phase of ["trial","restoring-before-renames","restoring-home-retained","restoring-snapshot-restored"]){
 test(`replacement installer recovers an interrupted ${phase}`,async t=>{
  const f=fixture(t);await f.boot();const state=f.state();state.phase=phase==="trial"?"trial":"restoring";
  fs.writeFileSync(path.join(f.home,"store/record"),"interrupted");
  if(state.phase==="restoring"){
   state.retainedHome=path.join(path.dirname(f.home),".one-installer-recovery-"+crypto.randomUUID());
   if(phase!=="restoring-before-renames")fs.renameSync(f.home,state.retainedHome);
   if(phase==="restoring-snapshot-restored")fs.renameSync(state.snapshot,f.home);
  }f.save(state);await assert.rejects(f.boot(),/rolled back/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.configFile)),f.config);
  assert.deepEqual(fs.readFileSync(path.join(f.home,"store/attachment")),f.attachment);
  assert.equal(fs.readFileSync(path.join(f.state().retainedHome,"store/record"),"utf8"),"interrupted");
 });
}
test("a rolled-back installer requires explicit retry approval and retains the prior receipt",async t=>{
 const f=fixture(t),start=f.options.start;
 f.options.start=async()=>({...await start(),version:"wrong"});await assert.rejects(f.boot());
 const retained=f.state().retainedHome;f.options.start=start;
 f.options.argv.push(`--installer-storage-retry-hash=${f.approved}`);await f.boot();
 assert.equal(f.state().phase,"complete");assert.ok(fs.existsSync(retained));
 assert.equal(fs.readdirSync(f.root).filter(n=>n.startsWith("installer-recovery-")).length,1);
});

test("runtime-updater approval flags never authorize installer migration",async t=>{
 const f=fixture(t);f.options.argv=f.options.argv.map(value=>value.replace('--installer-storage-','--storage-'));
 await assert.rejects(f.boot(),/reviewed storage plan/);assert.deepEqual(f.counts(),{starts:0,applies:0});
});

test("a live failed startup retains secret-free original failure diagnostics before recovery pauses",async t=>{
 const f=fixture(t),start=f.options.start;
 f.options.start=async()=>{await start();throw Error('Startup timed out: private-control-token-fixture');};
 await assert.rejects(f.boot(),/Stop the workspace/);
 assert.equal(f.state().phase,'trial');
 assert.equal(f.state().failure.stage,'trial-start');
 assert.equal(f.state().failure.category,'startup-timeout');
 assert.ok(!fs.readFileSync(f.journal,'utf8').includes('private-control-token-fixture'));
 assert.ok(fs.existsSync(f.state().snapshot));
});
test("restored failures retain their original stage without raw exception text",async t=>{
 const f=fixture(t),run=f.options.cliRunner;
 f.options.cliRunner=async(cli,args)=>{if(args[0]==='storage-upgrade')throw Error('synthetic-secret-password');return run(cli,args);};
 await assert.rejects(f.boot(),/old home was restored/);
 assert.equal(f.state().phase,'rolled-back');assert.equal(f.state().failure.stage,'storage-apply');
 assert.equal(f.state().failure.category,'operation-failed');
 assert.ok(!fs.readFileSync(f.journal,'utf8').includes('synthetic-secret-password'));
});

import assert from 'node:assert/strict';
const repo='ak-sekine/heibon-mahjong', bad=8107050354, good=7980952202;
const badSha='c3165603f31f9efd2cebe3ced87fcbcea7576551', goodSha='99f6d146049133a1471bd62265089f5b65500563';
const token=process.env.GH_TOKEN;
assert.equal(process.env.GITHUB_REPOSITORY,repo); assert.equal(process.env.GITHUB_REF,'refs/heads/issue/69-independent-publication-v2');
assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch'); assert.ok(token);
const base=`https://api.github.com/repos/${repo}`;
async function request(path,options={}) {
 const response=await fetch(base+path,{...options,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28',...(options.body?{'content-type':'application/json'}:{})},signal:AbortSignal.timeout(20000)});
 const body=await response.text();
 console.log(`${options.method||'GET'} ${path.split('?')[0]}: HTTP ${response.status}`);
 if(!response.ok) throw new Error(`API ${response.status}: operation stopped; re-read state before any retry`);
 return {status:response.status,data:body?JSON.parse(body):null};
}
const get=async p=>(await request(p)).data;
const list=await get('/deployments?environment=worker-development&per_page=100');
assert.ok(list.length>=2 && list[0].id===bad && list[0].sha===badSha && list[0].environment==='worker-development' && list[1].id===good && list[1].sha===goodSha && list[1].environment==='worker-development','Unexpected deployments');
const previous=await get(`/deployments/${good}/statuses?per_page=100`); assert.ok(previous[0]?.id===22861091348 && previous[0]?.state==='success' && previous[0]?.log_url==='https://github.com/ak-sekine/heibon-mahjong/actions/runs/45038169955/job/137259637776','Normal status changed');
const faulty=await get(`/deployments/${bad}/statuses?per_page=100`); assert.ok(faulty[0]?.id===23297617226 && faulty[0]?.state==='success' && faulty[0]?.log_url==='https://github.com/ak-sekine/heibon-mahjong/actions/runs/45979397697/job/140439145030','Diagnostic status changed');
const run=await get('/actions/runs/45979397697/attempts/1'); assert.ok(run.head_sha===badSha && run.conclusion==='success' && run.event==='workflow_dispatch');
const main=await get('/git/ref/heads/main'); assert.equal(main.object.sha,'fa4d4437f8e5b6ca015b3db3e353d12bc4423968');
const branch=await get('/git/ref/heads/issue/69-independent-publication-v2'); assert.equal(branch.object.sha,process.env.GITHUB_SHA,'Recovery ref changed');
const pages=await get('/git/ref/heads/pages-verified'); assert.equal(pages.object.sha,'3c96a4ef4606d4890dd6c34bd0d0b59ece0b642c');
const stateFile=await get('/contents/state.json?ref=pages-verified'); const state=JSON.parse(Buffer.from(stateFile.content,'base64').toString()); assert.equal(state.pending,null); assert.equal(state.current.development.sha,goodSha);
for (const status of ['queued','in_progress','waiting']) {
 const runs=await get(`/actions/runs?status=${status}&per_page=100`); assert.equal(runs.total_count,runs.workflow_runs.length,'Incomplete run listing');
 for (const r of runs.workflow_runs) { if (String(r.id)===process.env.GITHUB_RUN_ID) continue;
  // A push of this issue ref can run CI but the workflow's publication job only runs on explicit dispatch.
  if(r.event==='push' && r.head_branch==='issue/69-independent-publication-v2' && r.path==='.github/workflows/environments.yml') continue;
  throw new Error(`Concurrent workflow ${r.id}; stopped`);
 }
}
// Verify the exact start state again while holding pages-publication concurrency.
assert.equal((await get('/deployments?environment=worker-development&per_page=1'))[0]?.id,bad);
assert.equal((await get('/git/ref/heads/pages-verified')).object.sha,pages.object.sha);
const posted=await request(`/deployments/${bad}/statuses`,{method:'POST',body:JSON.stringify({state:'inactive',description:'Recovery of record accidentally created by read-only diagnostic',auto_inactive:false})}); assert.equal(posted.status,201); assert.equal(posted.data.state,'inactive');
assert.equal((await get(`/deployments/${bad}/statuses?per_page=1`))[0]?.state,'inactive');
const deleted=await request(`/deployments/${bad}`,{method:'DELETE'}); assert.equal(deleted.status,204);
const probe=await fetch(base+`/deployments/${bad}`,{headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)}); console.log(`GET deleted deployment: HTTP ${probe.status}`); assert.equal(probe.status,404);
const latest=await get('/deployments?environment=worker-development&per_page=1'); assert.equal(latest[0]?.id,good); assert.equal(latest[0]?.sha,goodSha);
const final=await get(`/deployments/${good}/statuses?per_page=1`); assert.equal(final[0]?.id,22861091348); assert.equal(final[0]?.state,'success');
assert.equal((await get('/git/ref/heads/pages-verified')).object.sha,pages.object.sha);
console.log('Recovery confirmed; normal deployment status preserved.');

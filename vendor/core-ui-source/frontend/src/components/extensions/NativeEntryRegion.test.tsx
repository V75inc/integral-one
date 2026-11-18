import {useEffect} from 'react';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import type {ContributionLifecycleApi, ContributionLifecycleHandle} from '../entries/contributionLifecycle';
import NativeEntryRegion from './NativeEntryRegion';
const state = vi.hoisted(()=>({pending:false, views:[{id:'view',name:'Lines',type:'editable_related_lines',config:{_manifest_view_key:'lines'}}]}));
vi.mock('../../hooks/useTrackViews',()=>({useTrackViews:()=>({data:state.views,isPending:state.pending,isError:false})}));
const validate=vi.fn(async()=>({ok:true}));const submit=vi.fn(async()=>({ok:true,outcomeRecorded:true}));
vi.mock('../entries/NativeContributionHost',()=>({NativeContributionHost:({lifecycle}: {lifecycle:ContributionLifecycleApi})=>{
 useEffect(()=>lifecycle.register({requestValidate:validate,requestSubmit:submit}),[lifecycle.register]);
 return <p>Native fields</p>;
}}));
function fixture(){let handle!:ContributionLifecycleHandle;const lifecycle:ContributionLifecycleApi={mode:'create',placement:'entry_compose',trackId:'track',appId:'app',customFields:{},register:next=>{handle=next;return()=>{};}};return{lifecycle,handle:()=>handle};}
afterEach(()=>{cleanup();vi.clearAllMocks();state.pending=false;});
it('preserves the committed ID through the native line persistence lifecycle',async()=>{
 const test=fixture();render(<NativeEntryRegion viewKey="lines" lifecycle={test.lifecycle} onMounted={()=>{}}/>);
 await screen.findByText('Native fields');await waitFor(()=>expect(test.handle()).toBeDefined());
 expect((await test.handle().requestValidate()).ok).toBe(true);
 expect((await test.handle().requestSubmit('committed')).ok).toBe(true);
 expect(submit).toHaveBeenCalledWith('committed');
});
it('fails closed when a saved region is missing or loading',async()=>{
 const test=fixture();render(<NativeEntryRegion viewKey="missing" lifecycle={test.lifecycle} onMounted={()=>{}}/>);
 await screen.findByRole('alert');expect((await test.handle().requestValidate()).ok).toBe(false);expect(submit).not.toHaveBeenCalled();
});

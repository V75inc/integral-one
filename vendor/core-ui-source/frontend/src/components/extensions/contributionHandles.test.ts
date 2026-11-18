import {expect, it, vi} from 'vitest';
import {runContributionHandles} from './contributionHandles';
const handle = () => ({requestValidate: vi.fn(async () => ({ok: true})), requestSubmit: vi.fn(async () => ({ok: true, outcomeRecorded: true}))});
it('runs every independent region during validation and submit', async () => {
  const first=handle(), second=handle();
  expect((await runContributionHandles([first,second],'validate')).ok).toBe(true);
  expect(first.requestValidate).toHaveBeenCalledOnce();expect(second.requestValidate).toHaveBeenCalledOnce();
  expect((await runContributionHandles([first,second],'submit','entry')).ok).toBe(true);
  expect(second.requestSubmit).toHaveBeenCalledWith('entry');
});
it('stops at validation failure before later regions run', async () => {
  const first=handle(),second=handle();first.requestValidate.mockResolvedValue({ok:false});
  expect((await runContributionHandles([first,second],'validate')).ok).toBe(false);
  expect(second.requestValidate).not.toHaveBeenCalled();
});
it('retains earlier recorded outcomes if a later region fails', async () => {
  const first=handle(),second=handle();second.requestSubmit.mockResolvedValue({ok:false,outcomeRecorded:false});
  expect(await runContributionHandles([first,second],'submit','entry')).toMatchObject({ok:false,outcomeRecorded:true});
});
it('suppresses later work if the scope closes during an awaited region', async () => {
  let active=true;const first=handle(),second=handle();first.requestSubmit.mockImplementation(async()=>{active=false;return{ok:true,outcomeRecorded:true};});
  expect(await runContributionHandles([first,second],'submit','entry',()=>active)).toMatchObject({ok:false,outcomeRecorded:true});
  expect(second.requestSubmit).not.toHaveBeenCalled();
});

it('preserves prior recorded work when a later region throws', async () => {
  const first=handle(),second=handle();second.requestSubmit.mockRejectedValue(new Error('Readback unavailable'));
  expect(await runContributionHandles([first,second],'submit','entry')).toMatchObject({ok:false,outcomeRecorded:true,error:'Readback unavailable'});
});

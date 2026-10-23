import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { NativeHome } from '../NativeHome';
import type { HomeElement } from '../nativeHomeTypes';
import { extensionsApi } from '../../../api/extensions';
const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: 'ws' } }) }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../../api/extensions', async original => ({ ...await original<typeof import('../../../api/extensions')>(), extensionsApi: { invokeQuery: vi.fn(async () => ({ output: { items: [{ id: 'n.Entry.one', title: 'Readable note' }], total_estimate: 1 } })), invokeOperation: vi.fn(async () => ({ output: { message: 'Saved' } })), resolveNavigation: vi.fn() } }));
const form: HomeElement = { id: 'form', type: 'form', title: 'Message', operation_key: 'echo', submit_label: 'Send', fields: [{ name: 'message', label: 'Your message', required: true }] };
function view(node: HomeElement, preview = false, refreshVersion = 1) { return <NativeHome appId="a" workspaceId="ws" node={node} preview={preview} liveData={!preview} refreshVersion={refreshVersion} onChanged={vi.fn()} />; }
function mount(node: HomeElement, preview = false) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(view(node, preview), { wrapper: ({ children }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider> }); }
beforeEach(() => vi.clearAllMocks());
it('renders a custom Home using native controls with no frame', async () => {
 mount({id:'root',type:'grid',children:[{id:'intro',type:'heading',text:'Seamless Home'},{id:'summary',type:'text',title:'Home summary'},form]});
 expect(screen.getByRole('heading', {name:'Seamless Home'})).toBeVisible();
 expect(screen.getByLabelText('Your message')).toBeVisible();
 expect(screen.getByText('Home summary')).toBeVisible();
 expect(document.querySelector('iframe')).toBeNull();
 expect(extensionsApi.invokeOperation).not.toHaveBeenCalled();
});
it('invokes the declared action with one intent key and reports updates through toast', async () => {
 mount(form); fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Send' }));
 await waitFor(() => expect(extensionsApi.invokeOperation).toHaveBeenCalledWith('a','echo',{message:'Draft'},expect.any(String)));
 expect(toast).toHaveBeenCalledWith('Saved','success');
});
it('preserves a typed draft across a layout property/data refresh', () => {
 const mounted = mount(form); const input = screen.getByLabelText('Your message'); fireEvent.change(input,{target:{value:'Unsaved draft'}});
 mounted.rerender(view({...form,title:'Updated by agent'},false,2));
 expect(screen.getByLabelText('Your message')).toBe(input); expect(input).toHaveValue('Unsaved draft');
});
it('previews never invoke actions or queries until live data is enabled', () => {
 mount({id:'root',type:'stack',children:[form,{id:'records',type:'records',query_key:'notes',title:'Notes'}]},true);
 expect(screen.getByRole('button',{name:'Send'})).toBeDisabled();
 expect(screen.getByText('Enable live data to preview this component.')).toBeVisible();
 expect(extensionsApi.invokeOperation).not.toHaveBeenCalled(); expect(extensionsApi.invokeQuery).not.toHaveBeenCalled();
});
it('uses readable data in the native record component', async () => {
 mount({id:'records',type:'records',query_key:'notes',title:'Notes'});
 expect(await screen.findByRole('button',{name:'Readable note'})).toBeVisible();
});

it('starts a fresh form when coauthoring changes the operation binding', () => {
 const mounted = mount(form); fireEvent.change(screen.getByLabelText('Your message'),{target:{value:'Draft for the old action'}});
 mounted.rerender(view({...form,operation_key:'different-operation'}));
 expect(screen.getByLabelText('Your message')).toHaveValue('');
 expect(screen.getByRole('button',{name:'Send'})).toBeEnabled();
});

it('shows declared defaults and submits unchecked checkboxes as false', async () => {
 mount({...form,payload:{message:'Default message'},fields:[...form.fields!,{name:'notify',label:'Notify',type:'checkbox'}]});
 expect(screen.getByLabelText('Your message')).toHaveValue('Default message');
 expect(screen.getByLabelText('Notify')).not.toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Send'}));
 await waitFor(() => expect(extensionsApi.invokeOperation).toHaveBeenCalledWith('a','echo',{message:'Default message',notify:false},expect.any(String)));
});

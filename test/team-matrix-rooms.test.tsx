import './dom.ts';
import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
  within,
} from '@testing-library/react';
import {
  TeamMatrixProvider,
  TeamMatrixRooms,
} from '../src/components/team-matrix-rooms.tsx';
afterEach(cleanup);
test('team room creation fills drafts, survives filtering, and saves only on explicit per-team Save', async () => {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const request = async (_path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (init?.method) {
      calls.push({ method: init.method, body });
      if (init.method === 'POST')
        return {
          ...body,
          matrixRoomId: '!team:example.org',
          matrixTrainerRoomId: '!group:example.org',
          names: {
            '!team:example.org': 'development_fcrww_Teams_Da_room',
            '!group:example.org': 'development_fcrww_Trainers_D_room',
          },
        };
      return {
        revision: 'v2',
        mapping: { ...body, teamId: 11 },
        projectionPending: false,
      };
    }
    return {
      revision: 'v1',
      items: [
        {
          teamId: 11,
          matrixRoomId: '',
          matrixTrainerRoomId: '',
          trainerGroup: '',
          canonical: false,
        },
      ],
      groups: [],
    };
  };
  const props = {
    path: 'clubs/development/fcrww',
    request,
    onBusyChange: () => {},
    onDirtyChange: () => {},
  };
  const view = render(
    <TeamMatrixProvider {...props}>
      <TeamMatrixRooms team={{ id: 11, name: 'Da' }} />
    </TeamMatrixProvider>,
  );
  const row = await screen.findByRole('group', {
    name: 'Matrix rooms for Da #11',
  });
  fireEvent.change(within(row).getByLabelText('Trainer group'), {
    target: { value: 'D' },
  });
  assert.equal(calls.length, 0);
  fireEvent.click(
    within(row).getByRole('button', { name: 'Create/link rooms' }),
  );
  await waitFor(() =>
    assert.equal(
      (within(row).getByLabelText('Team room ID') as HTMLInputElement).value,
      '!team:example.org',
    ),
  );
  assert.equal(calls.length, 1);
  assert(within(row).getByText('development_fcrww_Teams_Da_room'));
  assert(within(row).getByText('development_fcrww_Trainers_D_room'));
  view.rerender(
    <TeamMatrixProvider {...props}>
      <p>Filtered out</p>
    </TeamMatrixProvider>,
  );
  view.rerender(
    <TeamMatrixProvider {...props}>
      <TeamMatrixRooms team={{ id: 11, name: 'Da' }} />
    </TeamMatrixProvider>,
  );
  const restored = screen.getByRole('group', {
    name: 'Matrix rooms for Da #11',
  });
  assert.equal(
    (within(restored).getByLabelText('Trainer room ID') as HTMLInputElement)
      .value,
    '!group:example.org',
  );
  fireEvent.click(within(restored).getByRole('button', { name: 'Save' }));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.deepEqual(calls[1], {
    method: 'PUT',
    body: {
      matrixRoomId: '!team:example.org',
      matrixTrainerRoomId: '!group:example.org',
      trainerGroup: 'D',
      expectedRevision: 'v1',
      acceptLegacyConflict: false,
    },
  });
});

test('an older refresh cannot replace saved room names or the new revision',async()=>{
 const mapping={teamId:11,matrixRoomId:'!team:example.org',matrixTrainerRoomId:'',trainerGroup:''};
 let loads=0,finish!: (value:unknown)=>void;const old={revision:'v1',items:[mapping],groups:[],names:{'!team:example.org':'Old name'}};
 const request=async(_path:string,init?:RequestInit)=>{
  if(init?.method==='PUT')return {revision:'v2',mapping,projectionPending:false,names:{'!team:example.org':'Fresh name'}};
  return ++loads===1?old:new Promise(resolve=>{finish=resolve;});
 };
 render(<TeamMatrixProvider path="clubs/development/fcrww" request={request} onBusyChange={()=>{}} onDirtyChange={()=>{}}><TeamMatrixRooms team={{id:11,name:'Da'}}/></TeamMatrixProvider>);
 await screen.findByText('Old name');fireEvent.click(screen.getByRole('button',{name:'Reload Matrix mappings'}));
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByText('Fresh name');
 await act(async()=>finish(old));assert(screen.getByText('Fresh name'));assert.equal(screen.queryByText('Old name'),null);
});

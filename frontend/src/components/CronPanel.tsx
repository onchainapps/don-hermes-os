import { apiUrl } from '../lib/api-base';
import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  deliver: string;
  enabled: boolean;
  skills?: string[];
  repeat?: number;
  last_run?: string;
  next_run?: string;
}

export default function CronPanel() {
  const [jobs, setJobs] = createSignal<CronJob[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [selectedJob, setSelectedJob] = createSignal<string | null>(null);
  const [showCreate, setShowCreate] = createSignal(false);
  const [editJob, setEditJob] = createSignal<Partial<CronJob> | null>(null);

  // Create form
  const [newName, setNewName] = createSignal('');
  const [newSchedule, setNewSchedule] = createSignal('');
  const [newPrompt, setNewPrompt] = createSignal('');
  const [newDeliver, setNewDeliver] = createSignal('local');

  const fetchJobs = () => {
    setLoading(true);
    fetch(apiUrl('/api/jobs'))
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  let refreshInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    fetchJobs();
    refreshInterval = setInterval(fetchJobs, 15000);
  });

  onCleanup(() => clearInterval(refreshInterval));

  const action = (endpoint: string, method: string = 'POST', body?: any) => {
    fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(r => r.json())
      .then(() => setTimeout(fetchJobs, 500));
  };

  const createJob = () => {
    if (!newName() || !newSchedule() || !newPrompt()) return;
    action('/api/jobs', 'POST', {
      name: newName(),
      schedule: newSchedule(),
      prompt: newPrompt(),
      deliver: newDeliver(),
    });
    setNewName('');
    setNewSchedule('');
    setNewPrompt('');
    setShowCreate(false);
  };

  const deleteJob = (id: string) => {
    action(`/api/jobs/${id}`, 'DELETE');
  };

  return (
    <div class="flex h-full" style={{ background: '#050507' }}>
      {/* Job list */}
      <div class="flex flex-col w-80 flex-shrink-0 border-r border-hermes-cyan/10">
        {/* Header */}
        <div class="p-3 flex items-center justify-between" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)' }}>
          <span class="text-[10px] font-bold tracking-wider" style={{ color: '#00f3ff' }}>
            CRON JOBS
          </span>
          <button
            class="px-2 py-1 text-[10px] rounded cursor-pointer transition-all"
            style={{
              background: 'rgba(0,255,159,0.1)',
              border: '1px solid rgba(0,255,159,0.3)',
              color: '#00ff9f',
            }}
            onClick={() => setShowCreate(!showCreate())}
          >
            {showCreate() ? 'CANCEL' : '+ NEW'}
          </button>
        </div>

        {/* Create form */}
        <Show when={showCreate()}>
          <div class="p-3 space-y-2" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)', background: 'rgba(0,255,159,0.02)' }}>
            <input
              class="w-full bg-black/40 border border-hermes-cyan/20 rounded px-2 py-1.5 text-xs text-hermes-text focus:outline-none focus:border-hermes-cyan/40"
              placeholder="Job name"
              value={newName()}
              onInput={e => setNewName(e.currentTarget.value)}
            />
            <input
              class="w-full bg-black/40 border border-hermes-cyan/20 rounded px-2 py-1.5 text-xs text-hermes-text focus:outline-none focus:border-hermes-cyan/40"
              placeholder="Schedule (e.g. 30m, every 2h, 0 9 * * *)"
              value={newSchedule()}
              onInput={e => setNewSchedule(e.currentTarget.value)}
            />
            <textarea
              class="w-full bg-black/40 border border-hermes-cyan/20 rounded px-2 py-1.5 text-xs text-hermes-text focus:outline-none focus:border-hermes-cyan/40 resize-none"
              rows={3}
              placeholder="Prompt for the agent..."
              value={newPrompt()}
              onInput={e => setNewPrompt(e.currentTarget.value)}
            />
            <div class="flex gap-2">
              <select
                class="flex-1 bg-black/40 border border-hermes-cyan/20 rounded px-2 py-1.5 text-xs text-hermes-text"
                value={newDeliver()}
                onChange={e => setNewDeliver(e.currentTarget.value)}
              >
                <option value="local">Local</option>
                <option value="telegram">Telegram</option>
              </select>
              <button
                class="px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer"
                style={{
                  background: 'rgba(0,255,159,0.15)',
                  border: '1px solid rgba(0,255,159,0.4)',
                  color: '#00ff9f',
                }}
                onClick={createJob}
              >
                CREATE
              </button>
            </div>
          </div>
        </Show>

        {/* Job count */}
        <div class="px-3 py-1.5 text-[10px] opacity-40">
          {jobs().length} jobs
        </div>

        {/* Job list */}
        <div class="flex-1 overflow-y-auto" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.2) transparent' }}>
          <Show when={!loading()} fallback={
            <div class="p-4 text-center text-xs opacity-30">Loading...</div>
          }>
            <For each={jobs()}>
              {(job) => (
                <div
                  class="px-3 py-2.5 border-b cursor-pointer transition-all hover:bg-white/[0.02]"
                  style={{
                    'border-color': 'rgba(0,243,255,0.05)',
                    background: selectedJob() === job.id ? 'rgba(0,243,255,0.06)' : 'transparent',
                  }}
                  onClick={() => setSelectedJob(job.id)}
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <div
                        class="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: job.enabled ? '#00ff9f' : '#ff006e',
                          'box-shadow': `0 0 4px ${job.enabled ? '#00ff9f' : '#ff006e'}`,
                        }}
                      />
                      <span class="text-xs font-medium" style={{ color: '#e0ffe8' }}>
                        {job.name}
                      </span>
                    </div>
                  </div>
                  <div class="text-[10px] opacity-40 flex gap-3">
                    <span>{job.schedule}</span>
                    <span>{job.deliver}</span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Job detail */}
      <div class="flex-1 overflow-auto p-6">
        <Show when={selectedJob()} fallback={
          <div class="flex items-center justify-center h-full text-xs opacity-20">
            Select a job or create a new one
          </div>
        }>
          {(() => {
            const job = jobs().find(j => j.id === selectedJob());
            if (!job) return <div class="text-xs opacity-30">Job not found</div>;
            return (
              <div class="space-y-6 max-w-2xl">
                {/* Job header */}
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-lg font-bold" style={{ color: '#00f3ff', 'text-shadow': '0 0 6px #00f3ff' }}>
                      {job.name}
                    </h2>
                    <div class="text-[10px] opacity-30 font-mono mt-1">{job.id}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer"
                      style={{
                        background: job.enabled ? 'rgba(255,0,110,0.1)' : 'rgba(0,255,159,0.1)',
                        border: `1px solid ${job.enabled ? 'rgba(255,0,110,0.3)' : 'rgba(0,255,159,0.3)'}`,
                        color: job.enabled ? '#ff006e' : '#00ff9f',
                      }}
                      onClick={() => action(`/api/jobs/${job.id}/${job.enabled ? 'pause' : 'resume'}`, 'POST')}
                    >
                      {job.enabled ? 'PAUSE' : 'RESUME'}
                    </button>
                    <button
                      class="px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer"
                      style={{
                        background: 'rgba(0,243,255,0.1)',
                        border: '1px solid rgba(0,243,255,0.3)',
                        color: '#00f3ff',
                      }}
                      onClick={() => action(`/api/jobs/${job.id}/run`, 'POST')}
                    >
                      RUN NOW
                    </button>
                    <button
                      class="px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer"
                      style={{
                        background: 'rgba(255,0,110,0.05)',
                        border: '1px solid rgba(255,0,110,0.2)',
                        color: '#ff006e',
                      }}
                      onClick={() => deleteJob(job.id)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div class="space-y-4">
                  <div>
                    <label class="text-[10px] font-bold tracking-wider mb-1 block" style={{ color: '#00f3ff' }}>
                      SCHEDULE
                    </label>
                    <div class="text-sm" style={{ color: '#e0ffe8' }}>{job.schedule}</div>
                  </div>
                  <div>
                    <label class="text-[10px] font-bold tracking-wider mb-1 block" style={{ color: '#00f3ff' }}>
                      DELIVER
                    </label>
                    <div class="text-sm" style={{ color: '#e0ffe8' }}>{job.deliver}</div>
                  </div>
                  <div>
                    <label class="text-[10px] font-bold tracking-wider mb-1 block" style={{ color: '#00f3ff' }}>
                      STATUS
                    </label>
                    <div class="flex items-center gap-2">
                      <div
                        class="w-2 h-2 rounded-full"
                        style={{
                          background: job.enabled ? '#00ff9f' : '#ff006e',
                          'box-shadow': `0 0 6px ${job.enabled ? '#00ff9f' : '#ff006e'}`,
                        }}
                      />
                      <span class="text-sm" style={{ color: job.enabled ? '#00ff9f' : '#ff006e' }}>
                        {job.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label class="text-[10px] font-bold tracking-wider mb-1 block" style={{ color: '#00f3ff' }}>
                      PROMPT
                    </label>
                    <div
                      class="text-sm p-3 rounded leading-relaxed whitespace-pre-wrap"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(0,243,255,0.1)',
                        color: '#e0ffe8',
                      }}
                    >
                      {job.prompt || '(empty)'}
                    </div>
                  </div>
                  <Show when={job.skills?.length}>
                    <div>
                      <label class="text-[10px] font-bold tracking-wider mb-1 block" style={{ color: '#00f3ff' }}>
                        SKILLS
                      </label>
                      <div class="flex gap-1.5 flex-wrap">
                        <For each={job.skills || []}>
                          {(skill) => (
                            <span
                              class="px-2 py-0.5 text-[9px] rounded"
                              style={{ background: 'rgba(0,243,255,0.1)', border: '1px solid rgba(0,243,255,0.2)', color: '#00f3ff' }}
                            >
                              {skill}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            );
          })()}
        </Show>
      </div>
    </div>
  );
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, JsonPipe, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LangfuseService, LangfuseTrace, LangfuseObservation } from './langfuse.service';
import { TaskService, Task } from '../shared/services/task.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, JsonPipe, CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private langfuse = inject(LangfuseService);
  private taskService = inject(TaskService);

  traces = signal<LangfuseTrace[]>([]);
  selectedTrace = signal<LangfuseTrace | null>(null);
  observations = signal<LangfuseObservation[]>([]);
  doneTasks = signal<Task[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.loadTraces();
    this.loadDoneTasks();
  }

  private loadDoneTasks(): void {
    this.taskService.getTasksByStatus('done').subscribe((tasks) => {
      this.doneTasks.set(tasks);
    });
  }

  loadTraces() {
    this.loading.set(true);
    this.error.set(null);
    this.langfuse.getTraces().subscribe({
      next: (data) => {
        this.traces.set(data);
        if (data.length === 0) {
          this.error.set('No traces found. Langfuse integration may not be configured.');
        }
        this.loading.set(false);
      },
      error: (e: any) => {
        console.error('Langfuse load error:', e);
        this.error.set('Langfuse not configured. Connect your Langfuse account to see traces.');
        this.traces.set([]);
        this.loading.set(false);
      },
    });
  }

  selectTrace(trace: LangfuseTrace) {
    this.selectedTrace.set(trace);
    this.observations.set([]);
    this.langfuse.getObservations(trace.id).subscribe({
      next: (data) => this.observations.set(data),
    });
  }

  getTicketKey(trace: LangfuseTrace): string {
    return (trace.metadata?.['ticketKey'] as string) ?? '—';
  }

  getStatusClass(trace: LangfuseTrace): string {
    const meta = trace.metadata as Record<string, unknown>;
    if (meta?.['error']) return 'status--error';
    if (meta?.['skipped']) return 'status--skipped';
    return 'status--success';
  }

  getStatusLabel(trace: LangfuseTrace): string {
    const meta = trace.metadata as Record<string, unknown>;
    if (meta?.['error']) return 'Failed';
    if (meta?.['skipped']) return 'Skipped';
    return 'Success';
  }

  getTokenCount(obs: LangfuseObservation): string {
    if (!obs.usage) return '—';
    return `${obs.usage.input} in / ${obs.usage.output} out`;
  }
}

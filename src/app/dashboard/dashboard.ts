import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, JsonPipe, DecimalPipe } from '@angular/common';
import { LangfuseService, LangfuseTrace, LangfuseObservation, TokenUsageSummary } from './langfuse.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, JsonPipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private langfuse = inject(LangfuseService);

  traces = signal<LangfuseTrace[]>([]);
  selectedTrace = signal<LangfuseTrace | null>(null);
  observations = signal<LangfuseObservation[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  totalTokensUsed = signal<TokenUsageSummary | null>(null);

  ngOnInit() {
    this.loadTraces();
    this.loadTokenUsageSummary();
  }

  loadTraces() {
    this.loading.set(true);
    this.error.set(null);
    this.langfuse.getTraces().subscribe({
      next: (data) => {
        this.traces.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set('Failed to load traces. Check your Langfuse credentials.');
        this.loading.set(false);
      },
    });
  }

  loadTokenUsageSummary() {
    this.langfuse.getTokenUsageSummary().subscribe({
      next: (summary) => {
        this.totalTokensUsed.set(summary);
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

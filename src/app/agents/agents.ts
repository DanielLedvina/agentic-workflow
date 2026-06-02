import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AgentsService, Agent } from './agents.service';

interface AgentRow extends Agent {
  editing: boolean;
  editName: string;
  editSystemPrompt: string;
  saving: boolean;
  error: string | null;
}

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './agents.html',
  styleUrl: './agents.scss',
})
export class Agents implements OnInit {
  private agentsService = inject(AgentsService);

  rows = signal<AgentRow[]>([]);
  loading = signal(false);
  loadError = signal<string | null>(null);

  adding = signal(false);
  newName = signal('');
  newSystemPrompt = signal('');
  addSaving = signal(false);
  addError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAgents();
  }

  private loadAgents(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.agentsService.getAgents().subscribe({
      next: (agents) => {
        this.rows.set(
          agents.map((a) => ({
            ...a,
            editing: false,
            editName: a.name,
            editSystemPrompt: a.systemPrompt,
            saving: false,
            error: null,
          }))
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set('Failed to load agents. Please try again.');
        this.loading.set(false);
      },
    });
  }

  startEdit(row: AgentRow): void {
    row.editing = true;
    row.editName = row.name;
    row.editSystemPrompt = row.systemPrompt;
    row.error = null;
    this.rows.update((rows) => [...rows]);
  }

  cancelEdit(row: AgentRow): void {
    row.editing = false;
    row.error = null;
    this.rows.update((rows) => [...rows]);
  }

  saveEdit(row: AgentRow): void {
    const name = row.editName.trim();
    const systemPrompt = row.editSystemPrompt.trim();
    if (!name) {
      row.error = 'Name is required.';
      this.rows.update((rows) => [...rows]);
      return;
    }
    row.saving = true;
    row.error = null;
    this.rows.update((rows) => [...rows]);
    this.agentsService.updateAgent(row.id, { name, systemPrompt }).subscribe({
      next: (updated) => {
        this.rows.update((rows) =>
          rows.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  ...updated,
                  editing: false,
                  editName: updated.name,
                  editSystemPrompt: updated.systemPrompt,
                  saving: false,
                  error: null,
                }
              : r
          )
        );
      },
      error: () => {
        this.rows.update((rows) =>
          rows.map((r) =>
            r.id === row.id
              ? { ...r, saving: false, error: 'Failed to save. Please try again.' }
              : r
          )
        );
      },
    });
  }

  openAddForm(): void {
    this.adding.set(true);
    this.newName.set('');
    this.newSystemPrompt.set('');
    this.addError.set(null);
  }

  cancelAdd(): void {
    this.adding.set(false);
    this.addError.set(null);
  }

  saveNewAgent(): void {
    const name = this.newName().trim();
    const systemPrompt = this.newSystemPrompt().trim();
    if (!name) {
      this.addError.set('Name is required.');
      return;
    }
    this.addSaving.set(true);
    this.addError.set(null);
    this.agentsService.createAgent({ name, systemPrompt }).subscribe({
      next: (agent) => {
        this.rows.update((rows) => [
          ...rows,
          {
            ...agent,
            editing: false,
            editName: agent.name,
            editSystemPrompt: agent.systemPrompt,
            saving: false,
            error: null,
          },
        ]);
        this.addSaving.set(false);
        this.adding.set(false);
      },
      error: () => {
        this.addError.set('Failed to create agent. Please try again.');
        this.addSaving.set(false);
      },
    });
  }

  updateNewName(value: string): void {
    this.newName.set(value);
  }

  updateNewSystemPrompt(value: string): void {
    this.newSystemPrompt.set(value);
  }

  updateRowEditName(row: AgentRow, value: string): void {
    row.editName = value;
    this.rows.update((rows) => [...rows]);
  }

  updateRowEditSystemPrompt(row: AgentRow, value: string): void {
    row.editSystemPrompt = value;
    this.rows.update((rows) => [...rows]);
  }
}

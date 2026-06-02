import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BoardService, Task } from './board.service';

@Component({
  selector: 'app-board',
  imports: [RouterLink, CommonModule],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board implements OnInit {
  private boardService = inject(BoardService);
  private router = inject(Router);

  tickets = signal<Task[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  columns: Task['status'][] = ['Waiting for Approve', 'In Progress', 'Done'];

  ngOnInit(): void {
    this.loadTasks();
  }

  private loadTasks(): void {
    this.loading.set(true);
    this.error.set(null);
    this.boardService.getTasks().subscribe({
      next: (data) => {
        this.tickets.set(data.tasks);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load tasks. Please refresh and try again.');
        this.loading.set(false);
      },
    });
  }

  getTicketsByStatus(status: Task['status']) {
    return this.tickets().filter((t) => t.status === status);
  }

  openCheckpoint(sessionId: string): void {
    this.router.navigate(['/checkpoint', sessionId]);
  }
}

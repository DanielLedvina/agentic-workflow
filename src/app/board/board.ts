import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TaskService, Task } from '../shared/services/task.service';

@Component({
  selector: 'app-board',
  imports: [RouterLink, CommonModule],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board implements OnInit {
  private taskService = inject(TaskService);
  private router = inject(Router);

  inProgressTasks = signal<Task[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.loadTasks();
  }

  private loadTasks(): void {
    this.loading.set(false);
    this.taskService.getTasksByStatus('in_progress').subscribe({
      next: (tasks) => {
        this.inProgressTasks.set(tasks);
      },
    });
  }

  openCheckpoint(sessionId: string): void {
    this.router.navigate(['/checkpoint', sessionId]);
  }
}

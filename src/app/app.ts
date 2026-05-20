import { Component, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

interface JiraTicket {
  key: string;
  summary: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignee: string;
  type: 'Bug' | 'Story' | 'Task';
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  tickets = signal<JiraTicket[]>([
    {
      key: 'AGD-1',
      summary: 'Set up Angular project structure',
      status: 'Done',
      priority: 'High',
      assignee: 'Daniel',
      type: 'Task',
    },
    {
      key: 'AGD-2',
      summary: 'Implement Jira ticket board view',
      status: 'In Progress',
      priority: 'High',
      assignee: 'Daniel',
      type: 'Story',
    },
    {
      key: 'AGD-3',
      summary: 'Add authentication with OAuth2',
      status: 'To Do',
      priority: 'Critical',
      assignee: 'Unassigned',
      type: 'Task',
    },
    {
      key: 'AGD-4',
      summary: 'Fix broken navigation on mobile',
      status: 'To Do',
      priority: 'Medium',
      assignee: 'Unassigned',
      type: 'Bug',
    },
    {
      key: 'AGD-5',
      summary: 'Write unit tests for ticket service',
      status: 'To Do',
      priority: 'Low',
      assignee: 'Unassigned',
      type: 'Task',
    },
  ]);

  columns: JiraTicket['status'][] = ['To Do', 'In Progress', 'Done'];

  getTicketsByStatus(status: JiraTicket['status']) {
    return this.tickets().filter((t) => t.status === status);
  }
}

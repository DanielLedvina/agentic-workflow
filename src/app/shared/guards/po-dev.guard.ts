import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { UserService } from '../services/user.service';

/**
 * Guard that allows PO, Developer (po_dev), Senior Dev, and Admin roles
 */
export const poDevGuard: CanActivateFn = (route, state) => {
  const userService = inject(UserService);
  const router = inject(Router);

  if (userService.isPOOrDeveloper()) {
    return true;
  }

  router.navigate(['/'], { queryParams: { returnUrl: state.url } });
  return false;
};

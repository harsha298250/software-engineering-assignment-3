export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500, options?: ErrorOptions) {
    super(message, options);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

import { UserRole } from '../shared/types.ts';

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class RoleMismatchError extends ForbiddenError {
  public readonly actualRole: UserRole;
  public readonly expectedRole: UserRole;

  constructor(actualRole: UserRole, expectedRole: UserRole, message: string) {
    super(message);
    this.actualRole = actualRole;
    this.expectedRole = expectedRole;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

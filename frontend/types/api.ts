export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
}

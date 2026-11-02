export interface ClassTeacher {
  id: number;
  classId: number;
  schoolMemberId: number;
  isHomeroom: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

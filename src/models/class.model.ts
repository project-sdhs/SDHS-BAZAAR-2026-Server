/** 학교 반 정보 */
export interface SchoolClass {
  id: number;
  grade: number;
  classNo: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

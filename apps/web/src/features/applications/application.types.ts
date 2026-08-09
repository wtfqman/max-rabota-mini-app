import type { PublicAdCard } from '../vacancies/vacancy.types.js';
import type { PublicAdDetail } from '../ads/ad.types.js';

export type JobApplicationStatus = 'new' | 'viewed' | 'contacted' | 'suitable' | 'rejected' | 'withdrawn';

export interface JobApplicationContact {
  type: string;
  label: string | null;
  value: string;
  isPreferred: boolean;
}

export interface JobApplicationResumeSnapshot {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  shortSalary: string | null;
  locationShort: string | null;
  city: string | null;
  district: string | null;
  chips: PublicAdCard['chips'];
  resume?: unknown;
  photos: PublicAdDetail['photos'];
}

export interface JobApplication {
  id: string;
  vacancyAdId: string;
  applicantUserId: string;
  resumeAdId: string | null;
  coverMessage: string | null;
  status: JobApplicationStatus;
  viewedAt: string | null;
  contactedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  vacancy: PublicAdCard;
  applicant: {
    id: string;
    displayName: string | null;
    maxUsername: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  contactSnapshot: {
    contacts: JobApplicationContact[];
  } | null;
  resumeSnapshot: JobApplicationResumeSnapshot | null;
  resume: PublicAdDetail | null;
}

export interface CreateJobApplicationPayload {
  resumeAdId?: string | null;
  coverMessage?: string | null;
  contact?: {
    type: 'max' | 'phone' | 'email' | 'website' | 'other';
    label?: string | null;
    value: string;
  } | null;
}

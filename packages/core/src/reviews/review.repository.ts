import { ReviewStatus, type Ad, type PrismaClient, type Review } from '@rabst24/db';

export interface ReviewCreateData {
  adId: string;
  rating?: number;
  text?: string;
}

export type ReviewWithAuthor = Review & {
  author: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    maxUsername: string | null;
  };
  ad: {
    id: string;
    title: string;
    type: string;
  } | null;
};

export class ReviewRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(authorId: string, subjectId: string, dto: ReviewCreateData): Promise<Review> {
    return this.db.review.create({
      data: {
        authorId,
        subjectId,
        adId: dto.adId,
        rating: dto.rating ?? 5,
        text: dto.text,
        status: ReviewStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });
  }

  async findTargetAd(adId: string): Promise<Pick<Ad, 'id' | 'ownerId' | 'title' | 'type' | 'status' | 'deletedAt'> | null> {
    return this.db.ad.findFirst({
      where: {
        id: adId,
        deletedAt: null
      },
      select: {
        id: true,
        ownerId: true,
        title: true,
        type: true,
        status: true,
        deletedAt: true
      }
    });
  }

  async findByAuthorSubjectAd(authorId: string, subjectId: string, adId: string): Promise<Review | null> {
    return this.db.review.findFirst({
      where: {
        authorId,
        subjectId,
        adId,
        deletedAt: null
      }
    });
  }

  async listForUser(userId: string): Promise<ReviewWithAuthor[]> {
    return this.db.review.findMany({
      where: {
        subjectId: userId,
        status: ReviewStatus.PUBLISHED,
        deletedAt: null
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            maxUsername: true
          }
        },
        ad: {
          select: {
            id: true,
            title: true,
            type: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}

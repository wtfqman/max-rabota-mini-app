import { parseRevisionData, parseRevisionMedia } from './ad-revision.repository.js';

export function serializeRevisionSummary(
  revision:
    | {
        id: string;
        version: number;
        status: string;
        dataJson: string;
        mediaJson: string | null;
        rejectionReason: string | null;
        submittedAt: Date | null;
        approvedAt: Date | null;
        rejectedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }
    | null
    | undefined
) {
  if (!revision) {
    return null;
  }

  return {
    id: revision.id,
    version: revision.version,
    status: revision.status.toLowerCase(),
    rejectionReason: revision.rejectionReason,
    submittedAt: revision.submittedAt?.toISOString() ?? null,
    approvedAt: revision.approvedAt?.toISOString() ?? null,
    rejectedAt: revision.rejectedAt?.toISOString() ?? null,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    snapshot: serializeRevisionSnapshot(revision.dataJson, revision.mediaJson)
  };
}

export function serializeRevisionSnapshot(dataJson: string, mediaJson: string | null) {
  try {
    const data = parseRevisionData(dataJson);
    const media = parseRevisionMedia(mediaJson) ?? [];
    const coverPhoto = media.find((photo) => !photo.mimeType || photo.mimeType.startsWith('image/')) ?? media[0] ?? null;

    return {
      title: data.title,
      description: data.description,
      city: data.city,
      districtText: data.districtText,
      categoryText: data.categoryText,
      desiredPosition: data.desiredPosition ?? null,
      contacts: (data.contacts ?? []).map((contact, index) => ({
        id: `revision-contact-${index}`,
        type: contact.type,
        label: contact.label ?? null,
        value: contact.value,
        isPreferred: contact.isPreferred ?? index === 0
      })),
      mediaChanged: data.mediaChanged,
      coverPhoto: coverPhoto
        ? {
            url: coverPhoto.url,
            previewUrl: coverPhoto.previewUrl ?? null,
            mimeType: coverPhoto.mimeType ?? null,
            altText: coverPhoto.altText ?? null
          }
        : null
    };
  } catch {
    return null;
  }
}

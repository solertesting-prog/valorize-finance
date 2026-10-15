'use client';

import { useParams } from 'next/navigation';
import { BookingAdminView } from '@/components/booking-admin';

export default function AdminBookingPage() {
  const { id } = useParams<{ id: string }>();
  return <BookingAdminView id={id} basePath="/admin/citas" apiBase="/admin" />;
}

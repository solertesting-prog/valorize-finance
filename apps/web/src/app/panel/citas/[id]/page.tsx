'use client';

import { useParams } from 'next/navigation';
import { BookingAdminView } from '@/components/booking-admin';

export default function StaffBookingPage() {
  const { id } = useParams<{ id: string }>();
  return <BookingAdminView id={id} basePath="/panel/agenda" apiBase="/staff" />;
}

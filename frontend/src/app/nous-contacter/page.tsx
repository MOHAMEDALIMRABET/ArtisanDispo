/**
 * Redirection /nous-contacter → /etre-rappele
 * Les deux URLs sont accessibles et fonctionnelles
 */

import { redirect } from 'next/navigation';

export default function NousContacterPage() {
  redirect('/etre-rappele');
}

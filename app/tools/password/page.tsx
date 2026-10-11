import ToolPage, { generateMetadata as toolMetadata } from '../[slug]/page'
const params = () => Promise.resolve({ slug: 'password' })
export function generateMetadata() {
  return toolMetadata({ params: params() })
}
export default function PasswordPage() {
  return ToolPage({ params: params() })
}

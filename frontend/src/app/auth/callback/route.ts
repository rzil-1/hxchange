import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && user) {
      // 🚨 CRUCIAL CONSTRAINT: Verify Email Domain 🚨
      if (!user.email?.endsWith('@nitk.edu.in')) {
        // If it's not a valid college email, immediately sign them out
        await supabase.auth.signOut()
        
        // Redirect back home with an error parameter to trigger a toast
        return NextResponse.redirect(`${origin}/?error=UnauthorizedDomain`)
      }

      // Valid email, redirect them to their requested page
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/?error=AuthFailed`)
}

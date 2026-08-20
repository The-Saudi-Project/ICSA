import { useState } from 'react'
import { requestOtp, verifyOtp } from '../lib/api.js'
import { Button } from './ui/Button.js'
import { Input } from './ui/Input.js'

export function PhoneVerificationModal({
  isOpen,
  onClose,
  onVerified,
}: {
  isOpen: boolean
  onClose: () => void
  onVerified: () => void
}) {
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const isSaudiNumber = (p: string) => p.startsWith('+966') || p.startsWith('05')

  async function handleNext() {
    setError(null)
    setLoading(true)

    try {
      if (!isSaudiNumber(phone)) {
        // Non-Saudi: save phone directly and skip OTP
        localStorage.setItem('customerPhone', phone)
        onVerified()
      } else {
        // Saudi: request OTP
        await requestOtp(phone)
        setOtpSent(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setError(null)
    setLoading(true)

    try {
      const result = await verifyOtp(phone, otp)
      localStorage.setItem('customerPhone', phone)
      localStorage.setItem('customerToken', result.token)
      onVerified()
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
      <div className="bg-ground rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-h2 font-bold mb-2">
          {otpSent ? 'Enter OTP' : 'Verify Phone'}
        </h2>
        <p className="text-body text-ink-soft mb-6">
          {otpSent
            ? `We sent a code to ${phone}`
            : 'Please enter your phone number to continue.'}
        </p>

        {error ? (
          <div className="mb-4 p-3 bg-status-danger-wash text-status-danger rounded-lg text-small">
            {error}
          </div>
        ) : null}

        {!otpSent ? (
          <div className="space-y-4">
            <Input
              label="Phone Number"
              placeholder="+966 5X XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleNext()} disabled={loading || !phone} className="flex-1">
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="OTP Code"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setOtpSent(false)} disabled={loading} className="flex-1">
                Back
              </Button>
              <Button variant="primary" onClick={() => void handleVerify()} disabled={loading || otp.length < 6} className="flex-1">
                Verify
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

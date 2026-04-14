// app/api/weather/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.WEATHER_API_KEY
  const city = 'Seoul'
  const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${city}&lang=ko`

  try {
    const response = await fetch(url)

    // 응답이 정상(200) 아닐 경우
    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: 'Weather API fetch failed', detail: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', detail: String(error) },
      { status: 500 }
    )
  }
}

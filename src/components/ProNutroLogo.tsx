interface Props {
  readonly width?: number
  readonly textColor?: string
}

export default function ProNutroLogo({ width = 200, textColor = '#2d2d2d' }: Props) {
  const height = Math.round(width * 0.34)
  const copper = '#C4916A'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 102"
      width={width}
      height={height}
      style={{ flexShrink: 0 }}
    >
      {/* Outer arc — 3/4 circle opening to the right */}
      <path
        d="M 75,10 A 50,50 0 1,1 75,90"
        fill="none"
        stroke={copper}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      {/* Middle arc */}
      <path
        d="M 70,22 A 38,38 0 1,1 70,78"
        fill="none"
        stroke={copper}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Inner arc */}
      <path
        d="M 66,33 A 27,27 0 1,1 66,67"
        fill="none"
        stroke={copper}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* ProNutro */}
      <text
        x="96"
        y="60"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="38"
        fontWeight="bold"
        fill={textColor}
      >
        ProNutro
      </text>

      {/* Subtitle */}
      <text
        x="97"
        y="78"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10.5"
        fill={textColor}
        opacity="0.65"
        letterSpacing="0.6"
      >
        nutrologia e terapias integrativas
      </text>
    </svg>
  )
}

export default function AppearanceSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">外观</h1>
        <p className="text-sm text-muted-foreground mt-1">
          主题、字体与界面显示
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        外观设置（开发中）
      </div>
    </div>
  )
}

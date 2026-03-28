export default function AboutSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">关于</h1>
        <p className="text-sm text-muted-foreground mt-1">版本信息与开源许可</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        MyReader v0.1.0
      </div>
    </div>
  )
}

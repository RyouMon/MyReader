import { ENTITY_LIST_ROW_ICONS } from "./entity-list-row-icons"

describe("ENTITY_LIST_ROW_ICONS", () => {
  it("should use a filled Material server icon for WebDAV", () => {
    expect(ENTITY_LIST_ROW_ICONS.webdavDataSource).toEqual({
      ios: "dns",
      android: "dns",
      iconSet: "material",
      tone: "webdav",
    })
  })

  it("should use a filled blue cloud for OneDrive", () => {
    expect(ENTITY_LIST_ROW_ICONS.onedriveDataSource).toEqual({
      ios: "cloud.fill",
      android: "cloud",
      tone: "onedrive",
    })
  })
})

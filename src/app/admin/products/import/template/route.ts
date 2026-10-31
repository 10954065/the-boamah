import { NextResponse, type NextRequest } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { productSheet } from "@/server/product-import";
import { getCurrentUser } from "@/server/session";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The product sheet to fill in: blank, or `?products=all` with every product already on the website. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "catalog:edit")) return new NextResponse("Not found", { status: 404 });
  const withProducts = request.nextUrl.searchParams.get("products") === "all";
  try {
    const sheet = await productSheet(withProducts);
    const day = new Date().toISOString().slice(0, 10);
    const fileName = withProducts ? `boamah-products-${day}.xlsx` : "boamah-products-template.xlsx";
    return new NextResponse(new Uint8Array(sheet), {
      headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin/products/import/template]", error);
    return new NextResponse("The sheet could not be made. Try again.", { status: 500 });
  }
}

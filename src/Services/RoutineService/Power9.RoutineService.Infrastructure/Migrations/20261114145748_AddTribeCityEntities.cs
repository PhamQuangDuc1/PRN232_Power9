// Migration bổ sung các bảng phòng, cư dân, tương tác Tribe City và kết bạn.
using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Power9.RoutineService.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTribeCityEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CityRooms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RoomCode = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    HostUserId = table.Column<int>(type: "int", nullable: false),
                    IsPrivate = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    MaxSlots = table.Column<int>(type: "int", nullable: false),
                    TotalCityScore = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiredAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CityRooms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CityRooms_Users_HostUserId",
                        column: x => x.HostUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Friendships",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    FriendId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Friendships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Friendships_Users_FriendId",
                        column: x => x.FriendId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Friendships_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CityInteractions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoomId = table.Column<int>(type: "int", nullable: false),
                    FromUserId = table.Column<int>(type: "int", nullable: false),
                    ToUserId = table.Column<int>(type: "int", nullable: false),
                    ActionType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CityInteractions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CityInteractions_CityRooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "CityRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CityInteractions_Users_FromUserId",
                        column: x => x.FromUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CityInteractions_Users_ToUserId",
                        column: x => x.ToUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CityResidents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoomId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    SlotIndex = table.Column<int>(type: "int", nullable: false),
                    HouseFloors = table.Column<int>(type: "int", nullable: false),
                    BuildingMaterials = table.Column<int>(type: "int", nullable: false),
                    RooftopStatus = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Theme = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    LastCheckInAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CityResidents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CityResidents_CityRooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "CityRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CityResidents_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CityInteractions_FromUserId",
                table: "CityInteractions",
                column: "FromUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CityInteractions_RoomId",
                table: "CityInteractions",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_CityInteractions_ToUserId",
                table: "CityInteractions",
                column: "ToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CityResidents_RoomId_SlotIndex",
                table: "CityResidents",
                columns: new[] { "RoomId", "SlotIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CityResidents_UserId",
                table: "CityResidents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CityRooms_HostUserId",
                table: "CityRooms",
                column: "HostUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CityRooms_RoomCode",
                table: "CityRooms",
                column: "RoomCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Friendships_FriendId",
                table: "Friendships",
                column: "FriendId");

            migrationBuilder.CreateIndex(
                name: "IX_Friendships_UserId_FriendId",
                table: "Friendships",
                columns: new[] { "UserId", "FriendId" },
                unique: true);
        }

        // Hoàn tác phần mở rộng Tribe City và kết bạn.
        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CityInteractions");

            migrationBuilder.DropTable(
                name: "CityResidents");

            migrationBuilder.DropTable(
                name: "Friendships");

            migrationBuilder.DropTable(
                name: "CityRooms");
        }
    }
}

// Lưu một trụ cột Power9 và liên kết tới các thói quen thuộc trụ cột đó.
namespace Power9.RoutineService.Domain.Entities;

public class RoutineCategory
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public ICollection<Routine> Routines { get; set; } = new List<Routine>();
}

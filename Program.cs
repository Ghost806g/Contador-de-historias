using Npgsql;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

// 1. Configurando o CORS (Permitindo que o seu HTML converse com a API)
builder.Services.AddCors(options =>
{
    options.AddPolicy("PermitirHTML", policy =>
    {
        policy.AllowAnyOrigin()   // Permite qualquer origem (ideal para desenvolvimento local)
              .AllowAnyMethod()   // Permite GET, POST, etc.
              .AllowAnyHeader();  // Permite qualquer cabeçalho de dados
    });
});

// 2. Registrando a conexão PostgreSQL para o projeto inteiro
// O C# vai ler aquela string que você colocou no appsettings.json
builder.Services.AddTransient<NpgsqlConnection>(_ =>
    new NpgsqlConnection(builder.Configuration.GetConnectionString("DefaultConnection")));

// Registrando Repositórios e Serviços
builder.Services.AddScoped<Contador_de_Historias.Repositories.IDatabaseRepository, Contador_de_Historias.Repositories.DatabaseRepository>();
builder.Services.AddHttpClient<Contador_de_Historias.Services.ILlmService, Contador_de_Historias.Services.LlmService>();

// Configurações padrão da API
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configura a interface visual do Swagger para testes (quando em desenvolvimento)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// Ativando a política de CORS que criamos lá em cima
app.UseCors("PermitirHTML");

app.UseAuthorization();

// Mapeia os endpoints dos nossos Controllers
app.MapControllers();

// Rota para servir o seu index.html na página inicial
app.MapGet("/", (HttpContext context) =>
{
    var htmlPath = Path.Combine(Directory.GetCurrentDirectory(), "index.html");
    return Results.File(htmlPath, "text/html");
});

// ===== INICIALIZAÇÃO DO BANCO DE DADOS =====
// Isso garante que as tabelas sejam criadas sozinhas quando rodar o projeto
using (var scope = app.Services.CreateScope())
{
    var connection = scope.ServiceProvider.GetRequiredService<NpgsqlConnection>();
    connection.Open();
    string sql = @"
        CREATE TABLE IF NOT EXISTS SessaoHistoria (
            ID_Sessao SERIAL PRIMARY KEY,
            Nome_Personagem VARCHAR(255) NOT NULL,
            Cenario_Contexto TEXT NOT NULL,
            Data_Criacao TIMESTAMP NOT NULL DEFAULT NOW(),
            Status VARCHAR(50) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS MensagemChat (
            ID_Mensagem SERIAL PRIMARY KEY,
            ID_Sessao INT NOT NULL REFERENCES SessaoHistoria(ID_Sessao) ON DELETE CASCADE,
            Papel VARCHAR(50) NOT NULL,
            Conteudo TEXT NOT NULL
        );
    ";
    connection.Execute(sql);
}
// ===========================================

app.Run();